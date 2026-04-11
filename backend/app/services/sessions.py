import asyncio
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any

import chess

from app.engine.stockfish import FEEDBACK_DEPTH, StockfishEngine
from app.models.feedback import AnalysisLine, Feedback, MoveResult
from app.models.session import OpponentMoveResponse, SessionStartResponse, SessionState
from app.services.feedback import (
    ALTERNATIVE_THRESHOLD_CP,
    build_alternative_feedback,
    build_correct_feedback,
    build_mistake_feedback,
    quality_from_cp_loss,
)
from app.services.llm import get_explanation
from app.services.openings import get_variation_tree

# In-memory session store
_sessions: dict[str, SessionState] = {}

# Primary engine: opponent moves + serial fallback analysis
_engine: StockfishEngine | None = None

# Dedicated analysis engine: background pre_eval only
_analysis_engine: StockfishEngine | None = None

# Single-worker executor serialises calls to _analysis_engine
_analysis_executor: ThreadPoolExecutor = ThreadPoolExecutor(max_workers=1)

# Single-worker executor for parallel post_eval (Case 3 fallback)
_post_eval_executor: ThreadPoolExecutor = ThreadPoolExecutor(max_workers=1)

# Keyed by session_id; holds the in-flight or completed pre_eval Future
_pre_eval_futures: dict[str, "Future[dict]"] = {}

# Timestamp (perf_counter) when each pre_eval was submitted — used to measure think time
_pre_eval_submit_times: dict[str, float] = {}

# Per-session Future for the in-flight LLM explanation. Resolved when the
# background task completes (success, failure, or timeout). The /explanation
# endpoint long-polls on this Future — clients make ONE request per mistake,
# not a polling loop.
_session_llm_futures: dict[str, "asyncio.Future[tuple[str | None, str]]"] = {}

# Long-poll wait cap. Should exceed the LLM timeout (8s in llm.py) so the
# Future has time to resolve naturally even on slow LLM responses.
SESSION_EXPLANATION_WAIT_TIMEOUT = 12.0

# Number of candidate moves analysed in background pre_eval.
# Start at 3 (same cost as old inline pre_eval) and increase once benchmarked.
PRE_EVAL_MULTIPV = 3

# ---------------------------------------------------------------------------
# Evaluation state classification
# ---------------------------------------------------------------------------

# Stockfish encodes forced mate as ±30000. Anything beyond ±9000 is a mate score
# (well outside the range of normal material/positional evaluations).
_MATE_THRESHOLD = 9000


def _eval_state(cp: int) -> int:
    """
    Classify a centipawn score into a state bucket (higher = better for the side).
    cp must be from the side-to-move's perspective (positive = winning).

      7  MATE          cp ≥  9000
      6  CRUSHING      cp ≥   700
      5  WINNING       cp ≥   200
      4  ADVANTAGE     cp ≥    50
      3  EQUAL         cp ≥   -50
      2  DISADVANTAGE  cp ≥  -200
      1  LOSING        cp ≥  -700
      0  LOST          cp <  -700  (or opponent has forced mate)
    """
    if cp >= _MATE_THRESHOLD:  return 7
    if cp >= 700:              return 6
    if cp >= 200:              return 5
    if cp >=  50:              return 4
    if cp >= -50:              return 3
    if cp >= -200:             return 2
    if cp >= -700:             return 1
    return 0


def _state_cp_loss(pre_cp: int, user_post_cp: int) -> int:
    """
    Compute a feedback-appropriate cp_loss via evaluation-state classification.

    Avoids the classic mate-score inflation bug: being up +30000 (forced mate)
    then playing a move that drops to +800 (still completely winning) looks like
    a 29200cp blunder under raw arithmetic but is a 1-state drop (MATE→CRUSHING)
    which correctly produces no significant feedback.

    pre_cp:       eval before user's move — user's POV (positive = user winning)
    user_post_cp: eval after user's move  — user's POV (positive = user still winning)

    Synthetic cp_loss values are calibrated to ALTERNATIVE_THRESHOLD (50) and
    BLUNDER_THRESHOLD (200) defined in feedback.py:
      0 drops → 0    no feedback
      1 drop  → 75   mistake (50 < 75 < 200)
      2 drops → 150  mistake
      3+ drops → 250 blunder (≥ 200)
    """
    drop = _eval_state(pre_cp) - _eval_state(user_post_cp)
    if drop <= 0:  return 0
    if drop == 1:  return 75
    if drop == 2:  return 150
    return 250


def set_engine(engine: StockfishEngine | None) -> None:
    global _engine
    _engine = engine


def get_engine() -> StockfishEngine | None:
    return _engine


def set_analysis_engine(engine: StockfishEngine | None) -> None:
    global _analysis_engine
    _analysis_engine = engine


def get_analysis_engine() -> StockfishEngine | None:
    return _analysis_engine


def clear_sessions() -> None:
    """Clear all in-memory sessions. For testing only."""
    _sessions.clear()
    _pre_eval_futures.clear()
    _pre_eval_submit_times.clear()
    _session_llm_futures.clear()


def _start_explanation_task(
    session_id: str,
    pre_fen: str,
    played_san: str,
    best_san: str,
    cp_loss: int,
    tactical_facts: list[str],
) -> None:
    """Kick off the LLM call and register a Future the endpoint can await."""
    loop = asyncio.get_running_loop()
    fut: asyncio.Future[tuple[str | None, str]] = loop.create_future()
    _session_llm_futures[session_id] = fut

    async def _run() -> None:
        try:
            result = await get_explanation(pre_fen, played_san, best_san, cp_loss, tactical_facts)
            if not fut.done():
                fut.set_result(result)
        except Exception as exc:  # defensive — get_explanation already swallows its own exceptions
            if not fut.done():
                fut.set_result((None, f"error — {type(exc).__name__}"))

    asyncio.create_task(_run())


async def await_explanation(
    session_id: str,
    timeout: float = SESSION_EXPLANATION_WAIT_TIMEOUT,
) -> tuple[str | None, str] | None:
    """Long-poll: block until the LLM result is ready, or return None on timeout."""
    fut = _session_llm_futures.get(session_id)
    if fut is None:
        return None
    try:
        result = await asyncio.wait_for(asyncio.shield(fut), timeout=timeout)
    except asyncio.TimeoutError:
        return None
    _session_llm_futures.pop(session_id, None)
    return result


# ---------------------------------------------------------------------------
# Pre-eval background machinery (shared with chaos.py)
# ---------------------------------------------------------------------------

def _run_analysis(
    engine: StockfishEngine,
    fen: str,
    elo: int | None,
    multipv: int,
    depth: int,
) -> tuple[dict, float]:
    """Run a single Stockfish analysis call. Returns (result, elapsed_seconds)."""
    if elo is not None:
        engine.set_elo(elo)
    try:
        t0 = time.perf_counter()
        result = engine.analyse(fen, multipv=multipv, depth=depth)
        return result, time.perf_counter() - t0
    finally:
        if elo is not None:
            engine.clear_elo()


def submit_pre_eval(session_id: str, fen: str, elo: int | None) -> None:
    """
    Fire background pre_eval on the analysis engine after an opponent move.
    No-op when the analysis engine is unavailable.
    """
    if _analysis_engine is None:
        return
    future = _analysis_executor.submit(
        _run_analysis, _analysis_engine, fen, elo, PRE_EVAL_MULTIPV, FEEDBACK_DEPTH
    )
    _pre_eval_futures[session_id] = future
    _pre_eval_submit_times[session_id] = time.perf_counter()


def pop_pre_eval_future(session_id: str) -> "tuple[Future[dict], float] | tuple[None, None]":
    """Remove and return (future, submit_time) for a session, or (None, None)."""
    future = _pre_eval_futures.pop(session_id, None)
    submit_time = _pre_eval_submit_times.pop(session_id, None)
    if future is None or submit_time is None:
        return None, None
    return future, submit_time


def _find_line_cp(lines: list[dict], uci_move: str) -> int | None:
    """Return the cp value for uci_move from a list of engine lines, or None."""
    for line in lines:
        if line.get("move_uci") == uci_move:
            return line.get("cp")
    return None


def evaluate_off_tree_eval(
    session_id: str,
    pre_fen: str,
    new_fen: str,
    uci_move: str,
    elo: int | None,
) -> tuple[int, list[dict], str | None, str, str | None]:
    """
    Compute cp_loss and supporting data for an off-tree move.

    Returns (cp_loss, raw_pre_eval_lines, best_move_uci, debug_msg, opponent_response_uci).

    opponent_response_uci is the engine's best reply to the user's move — used to
    ground LLM explanations ("after Rb1, Black plays Qxb1") so the model narrates
    facts rather than hallucinating the tactical sequence.

    Three cases, best-to-worst latency:
      1. Pre_eval done + user's move in top-N lines → one shallow post call for opponent.
      2. Pre_eval done + move not in lines         → one post_eval call (cp + opponent).
      3. Pre_eval not done (or absent)             → pre + post in parallel.
    """
    future, submit_time = pop_pre_eval_future(session_id)
    now = time.perf_counter()
    think_time = (now - submit_time) if submit_time is not None else None
    think_line = f"You thought for: {think_time:.2f}s" if think_time is not None else "Think time: unknown"

    if future is None or _engine is None:
        (cp_loss, lines, best_move, opponent_uci), pre_t, post_t = _evaluate_serial(pre_fen, new_fen, uci_move, elo)
        return (cp_loss, lines, best_move,
                f"{think_line}\nPre-move Stockfish: {pre_t:.2f}s\nPost-move Stockfish: {post_t:.2f}s",
                opponent_uci)

    if future.done():
        pre_eval, pre_t = future.result()
        user_line_cp = _find_line_cp(pre_eval.get("lines", []), uci_move)
        if user_line_cp is not None:
            # Case 1: cp from pre_eval; shallow post call to get opponent's response
            cp_loss, lines, best_move = _evaluate_from_pre_eval_no_post(pre_eval, uci_move)
            opp_result, opp_t = _run_analysis(_engine, new_fen, elo, 1, 10)
            opponent_uci = opp_result.get("best_move")
            return (cp_loss, lines, best_move,
                    f"{think_line}\nPre-move Stockfish: {pre_t:.2f}s\nPost-move Stockfish: {opp_t:.2f}s (opponent only)",
                    opponent_uci)
        cp_loss, lines, best_move, opponent_uci, post_t = _evaluate_post_only(pre_eval, new_fen, uci_move, elo)
        return (cp_loss, lines, best_move,
                f"{think_line}\nPre-move Stockfish: {pre_t:.2f}s\nPost-move Stockfish: {post_t:.2f}s",
                opponent_uci)

    # Pre-move still running — fire post_eval in parallel
    post_future = _post_eval_executor.submit(
        _run_analysis, _engine, new_fen, elo, 1, FEEDBACK_DEPTH // 2
    )

    t0 = time.perf_counter()
    pre_eval, pre_t = future.result()
    pre_wait = time.perf_counter() - t0

    user_line_cp = _find_line_cp(pre_eval.get("lines", []), uci_move)
    pre_cp = pre_eval.get("eval_cp") or 0

    if user_line_cp is not None:
        # Post already running but we don't need it for cp — still collect opponent response
        post_result, post_t = post_future.result()
        cp_loss = _state_cp_loss(pre_cp, user_line_cp)
        opponent_uci = post_result.get("best_move")
        debug = f"{think_line}\nPre-move Stockfish: {pre_t:.2f}s (waited {pre_wait:.2f}s extra)\nPost-move Stockfish: {post_t:.2f}s (opponent only)"
    else:
        post_result, post_t = post_future.result()
        user_post_cp = -(post_result.get("eval_cp") or 0)
        cp_loss = _state_cp_loss(pre_cp, user_post_cp)
        opponent_uci = post_result.get("best_move")
        debug = f"{think_line}\nPre-move Stockfish: {pre_t:.2f}s (waited {pre_wait:.2f}s extra)\nPost-move Stockfish: {post_t:.2f}s"

    return cp_loss, pre_eval.get("lines", []), pre_eval.get("best_move"), debug, opponent_uci


def _evaluate_from_pre_eval_no_post(
    pre_eval: dict,
    uci_move: str,
) -> tuple[int, list[dict], str | None]:
    """Move was in pre_eval lines — compute cp_loss directly, no engine call."""
    user_line_cp = _find_line_cp(pre_eval.get("lines", []), uci_move)
    pre_cp = pre_eval.get("eval_cp") or 0
    # user_line_cp is from the same pre-move POV, so it's directly comparable
    cp_loss = _state_cp_loss(pre_cp, user_line_cp or 0)
    return cp_loss, pre_eval.get("lines", []), pre_eval.get("best_move")


def _evaluate_post_only(
    pre_eval: dict,
    new_fen: str,
    uci_move: str,
    elo: int | None,
) -> tuple[int, list[dict], str | None, str | None, float]:
    """Move was outside pre_eval lines — run post_eval; returns cp + opponent response."""
    pre_cp = pre_eval.get("eval_cp") or 0
    post_result, post_t = _run_analysis(_engine, new_fen, elo, 1, FEEDBACK_DEPTH // 2)
    user_post_cp = -(post_result.get("eval_cp") or 0)  # flip: post is opponent's POV
    cp_loss = _state_cp_loss(pre_cp, user_post_cp)
    return cp_loss, pre_eval.get("lines", []), pre_eval.get("best_move"), post_result.get("best_move"), post_t


def _evaluate_serial(
    pre_fen: str,
    new_fen: str,
    uci_move: str,
    elo: int | None,
) -> tuple[tuple[int, list[dict], str | None, str | None], float, float]:
    """Two-call serial path (analysis engine absent). Returns ((cp_loss, lines, best, opponent), pre_t, post_t)."""
    pre_result, pre_t = _run_analysis(_engine, pre_fen, elo, PRE_EVAL_MULTIPV, FEEDBACK_DEPTH)
    post_result, post_t = _run_analysis(_engine, new_fen, elo, 1, FEEDBACK_DEPTH // 2)
    pre_cp = pre_result.get("eval_cp") or 0
    user_post_cp = -(post_result.get("eval_cp") or 0)  # flip: post is opponent's POV
    cp_loss = _state_cp_loss(pre_cp, user_post_cp)
    return (cp_loss, pre_result.get("lines", []), pre_result.get("best_move"), post_result.get("best_move")), pre_t, post_t


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------

def create_session(
    opening_id: str,
    variation_id: str,
    color: str,
    mode: str,
    elo: int | None,
) -> SessionStartResponse:
    tree = get_variation_tree(opening_id, variation_id)
    if tree is None:
        raise ValueError(f"Unknown opening/variation: {opening_id}/{variation_id}")

    board = chess.Board()
    session = SessionState(
        session_id=str(uuid.uuid4()),
        opening_id=opening_id,
        variation_id=variation_id,
        color=color,
        mode=mode,
        elo=elo,
        current_fen=board.fen(),
        move_history=[],
        score=0,
        tree_cursor=tree.moves,
    )
    _sessions[session.session_id] = session
    to_move = "white" if board.turn == chess.WHITE else "black"
    return SessionStartResponse(
        session_id=session.session_id,
        fen=session.current_fen,
        to_move=to_move,
    )


def get_session(session_id: str) -> SessionState | None:
    return _sessions.get(session_id)


async def process_move(session_id: str, uci_move: str) -> MoveResult:
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")

    board = chess.Board(session.current_fen)

    try:
        move = chess.Move.from_uci(uci_move)
        if move not in board.legal_moves:
            raise ValueError(f"Illegal move: {uci_move}")
    except Exception as exc:
        raise ValueError(str(exc))

    played_san = board.san(move)
    board.push(move)
    new_fen = board.fen()

    in_tree = uci_move in session.tree_cursor

    if in_tree:
        future, submit_time = pop_pre_eval_future(session_id)
        think_line = f"You thought for: {time.perf_counter() - submit_time:.2f}s" if submit_time is not None else "Think time: unknown"
        if future is not None:
            in_tree_debug = f"{think_line}\nPre-move Stockfish: was running — discarded (in-book move)\nPost-move Stockfish: skipped"
        else:
            in_tree_debug = f"{think_line}\nPre-move Stockfish: not running\nPost-move Stockfish: skipped (in-book move)"
        session.tree_cursor = session.tree_cursor[uci_move] or {}
        session.score += 1
        feedback = build_correct_feedback(played_san)
        _update_session(session, uci_move, new_fen, session.tree_cursor)
        return MoveResult(result="correct", feedback=feedback, fen=new_fen, debug_msg=in_tree_debug)

    # Off-tree: snapshot state so the client can undo if desired
    session.prev_fen = session.current_fen
    session.prev_cursor = dict(session.tree_cursor)

    if _engine is None:
        feedback = Feedback(
            quality="mistake",
            explanation=f"{played_san} is off the main line.",
        )
        _update_session(session, uci_move, new_fen, {})
        return MoveResult(result="mistake", feedback=feedback, fen=new_fen)

    pre_fen = session.current_fen
    cp_loss, raw_lines, best_move_uci, debug_msg, opponent_uci = await asyncio.to_thread(
        evaluate_off_tree_eval, session_id, pre_fen, new_fen, uci_move, session.elo
    )
    pre_board = chess.Board(pre_fen)
    lines = _to_analysis_lines(raw_lines, pre_board)
    best_san = lines[0].move_san if lines else (best_move_uci or uci_move)

    mainline_uci = _first_tree_move(session.tree_cursor)
    mainline_san: str | None = None
    if mainline_uci:
        try:
            mainline_san = pre_board.san(chess.Move.from_uci(mainline_uci))
        except Exception:
            mainline_san = mainline_uci

    if cp_loss <= ALTERNATIVE_THRESHOLD_CP:
        feedback = build_alternative_feedback(played_san, mainline_san or best_san, cp_loss, lines=lines)
        result = "alternative"
    else:
        quality = quality_from_cp_loss(cp_loss)
        feedback = build_mistake_feedback(played_san, best_san, cp_loss, lines=lines)
        result = feedback.quality
        # Derive concrete facts for LLM (python-chess, no inference needed from the model)
        post_board = chess.Board(new_fen)
        tactical_facts = _derive_tactical_facts(pre_board, post_board, move, opponent_uci, played_san, best_san)
        # Fire LLM in background — client long-polls /session/{id}/explanation
        _start_explanation_task(session_id, pre_fen, played_san, best_san, cp_loss, tactical_facts)

    _update_session(session, uci_move, new_fen, {})
    return MoveResult(result=result, feedback=feedback, fen=new_fen, debug_msg=debug_msg)


def get_hint(session_id: str) -> dict:
    """Return the first expected move from the tree cursor in SAN notation."""
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")
    uci = _first_tree_move(session.tree_cursor)
    if uci is None:
        raise ValueError("No hint available — end of opening line")
    board = chess.Board(session.current_fen)
    san = board.san(chess.Move.from_uci(uci))
    return {"move_san": san, "move_uci": uci}


def undo_move(session_id: str) -> str:
    """Revert the session to the state before the last off-tree move.

    Returns the restored FEN. Raises KeyError if session not found,
    ValueError if there is no move to undo.
    """
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")
    if session.prev_fen is None:
        raise ValueError("Nothing to undo")
    session.current_fen = session.prev_fen
    session.tree_cursor = session.prev_cursor or {}
    session.move_history = session.move_history[:-1]
    session.prev_fen = None
    session.prev_cursor = None
    return session.current_fen


def get_opponent_move(session_id: str) -> OpponentMoveResponse:
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")

    uci_move = _first_tree_move(session.tree_cursor)

    if uci_move is None:
        # Off-tree or end of line: fall back to engine best move
        if _engine is None:
            raise ValueError("No opponent move available — end of opening line")
        if session.elo is not None:
            _engine.set_elo(session.elo)
        try:
            result = _engine.analyse(session.current_fen)
        finally:
            if session.elo is not None:
                _engine.clear_elo()
        uci_move = result.get("best_move")
        if not uci_move:
            raise ValueError("Engine returned no best move")
        next_cursor: dict = {}
    else:
        next_cursor = session.tree_cursor.get(uci_move) or {}

    board = chess.Board(session.current_fen)
    board.push(chess.Move.from_uci(uci_move))
    new_fen = board.fen()

    _update_session(session, uci_move, new_fen, next_cursor)

    # Start background pre_eval for the position the user now faces
    submit_pre_eval(session_id, new_fen, session.elo)

    return OpponentMoveResponse(uci_move=uci_move, fen=new_fen, line_complete=not next_cursor)


def _derive_tactical_facts(
    pre_board: chess.Board,
    post_board: chess.Board,
    move: chess.Move,
    opponent_uci: str | None,
    played_san: str,
    best_san: str,
) -> list[str]:
    """Derive verifiable facts about the position using python-chess. No inference."""
    facts = []
    mover_color = pre_board.turn
    opponent_color = not mover_color

    piece_moved = pre_board.piece_at(move.from_square)
    if piece_moved:
        piece_name = chess.piece_name(piece_moved.piece_type)
        sq = chess.square_name(move.to_square)
        is_attacked = post_board.is_attacked_by(opponent_color, move.to_square)
        is_defended = post_board.is_attacked_by(mover_color, move.to_square)
        if is_attacked and not is_defended:
            facts.append(f"The {piece_name} moved to {sq} is undefended — opponent can capture it for free")
        elif is_attacked:
            facts.append(f"The {piece_name} moved to {sq} is under attack")

    if opponent_uci:
        try:
            opp_move = chess.Move.from_uci(opponent_uci)
            captured = post_board.piece_at(opp_move.to_square)
            opp_san = post_board.san(opp_move)
            if captured:
                captured_name = chess.piece_name(captured.piece_type)
                facts.append(f"Opponent's best reply is {opp_san}, winning the {captured_name}")
            else:
                facts.append(f"Opponent's best reply is {opp_san}")
        except Exception:
            pass

    return facts


def _to_analysis_lines(
    raw_lines: list[dict], board: chess.Board
) -> list[AnalysisLine]:
    """Convert raw engine output to AnalysisLine objects with SAN notation."""
    result = []
    for raw in raw_lines:
        uci = raw.get("move_uci", "")
        cp = raw.get("cp", 0)
        try:
            san = board.san(chess.Move.from_uci(uci))
        except Exception:
            san = uci
        result.append(AnalysisLine(move_uci=uci, move_san=san, cp=cp))
    return result


def _first_tree_move(cursor: dict[str, Any]) -> str | None:
    return next(iter(cursor), None)


def _update_session(
    session: SessionState,
    uci_move: str,
    new_fen: str,
    new_cursor: dict[str, Any],
) -> None:
    session.move_history.append(uci_move)
    session.current_fen = new_fen
    session.tree_cursor = new_cursor
