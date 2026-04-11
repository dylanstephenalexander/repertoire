import asyncio
import random
import uuid
from dataclasses import dataclass, field

import chess

from app.engine.maia import MaiaEngine, available_maia_models, lc0_available

from app.models.chaos import (
    ChaosOpponentMoveResponse,
    ChaosMoveResponse,
    ChaosStartResponse,
)
from app.models.feedback import Feedback
from app.services.feedback import (
    ALTERNATIVE_THRESHOLD_CP,
    build_mistake_feedback,
)
from app.services.opening_detect import detect_opening
from app.services.sessions import (  # shared Stockfish + pre_eval machinery
    _derive_tactical_facts,
    await_explanation,
    evaluate_off_tree_eval,
    get_engine,
    start_explanation_task,
    submit_pre_eval,
    to_analysis_lines,
)

# In-memory chaos session store
_chaos_sessions: dict[str, "_ChaosSession"] = {}

# Maia engines: lazy-loaded per elo_band, kept alive for the server lifetime
_maia_engines: dict[int, MaiaEngine] = {}

# Sentinel value for "use full-strength Stockfish"
STOCKFISH_BAND = 2000


@dataclass
class _ChaosSession:
    session_id: str
    user_color: str        # "white" | "black"
    elo_band: int
    current_fen: str
    move_history: list[str] = field(default_factory=list)
    opening_name: str | None = None  # most specific name confirmed so far


def engine_status() -> dict:
    return {
        "lc0": lc0_available(),
        "maia_models": available_maia_models(),
    }


def create_chaos_session(
    color: str,
    elo_band: int,
) -> ChaosStartResponse:
    if color == "random":
        color = random.choice(["white", "black"])

    session = _ChaosSession(
        session_id=str(uuid.uuid4()),
        user_color=color,
        elo_band=elo_band,
        current_fen=chess.Board().fen(),
    )
    _chaos_sessions[session.session_id] = session
    return ChaosStartResponse(
        session_id=session.session_id,
        fen=session.current_fen,
        user_color=color,
    )


async def process_chaos_move(
    session_id: str,
    uci_move: str,
    feedback_enabled: bool,
) -> ChaosMoveResponse:
    session = _chaos_sessions.get(session_id)
    if session is None:
        raise KeyError(f"Chaos session not found: {session_id}")

    board = chess.Board(session.current_fen)
    try:
        move = chess.Move.from_uci(uci_move)
        if move not in board.legal_moves:
            raise ValueError(f"Illegal move: {uci_move}")
    except Exception as exc:
        raise ValueError(str(exc))

    played_san = board.san(move)
    pre_fen = session.current_fen
    board.push(move)
    new_fen = board.fen()

    session.move_history.append(uci_move)
    session.current_fen = new_fen

    # Opening detection — keep updating while in theory (more specific names come later)
    opening_hit = detect_opening(new_fen)
    if opening_hit is not None:
        session.opening_name = opening_hit

    feedback: Feedback | None = None
    debug_msg: str | None = None
    if feedback_enabled:
        feedback, debug_msg = await _build_chaos_feedback(session_id, pre_fen, new_fen, played_san, uci_move)

    return ChaosMoveResponse(
        fen=new_fen,
        feedback=feedback,
        opening_name=session.opening_name,
        in_theory=opening_hit is not None,
        debug_msg=debug_msg,
    )


def get_chaos_opponent_move(session_id: str) -> ChaosOpponentMoveResponse:
    import time
    session = _chaos_sessions.get(session_id)
    if session is None:
        raise KeyError(f"Chaos session not found: {session_id}")

    t0 = time.perf_counter()
    uci_move = _get_engine_move(session.current_fen, session.elo_band)
    engine_move_time = time.perf_counter() - t0

    board = chess.Board(session.current_fen)
    move = chess.Move.from_uci(uci_move)
    if move not in board.legal_moves:
        raise ValueError(f"Engine returned illegal move: {uci_move}")

    board.push(move)
    new_fen = board.fen()

    session.move_history.append(uci_move)
    session.current_fen = new_fen

    opening_hit = detect_opening(new_fen)
    if opening_hit is not None:
        session.opening_name = opening_hit

    # Start background pre_eval for the position the user now faces
    submit_pre_eval(session.session_id, new_fen, None)

    engine_label = "Maia" if session.elo_band < STOCKFISH_BAND else "Stockfish"
    return ChaosOpponentMoveResponse(
        uci_move=uci_move,
        fen=new_fen,
        opponent_move_time=engine_move_time,
        opponent_engine=engine_label,
        opening_name=session.opening_name,
        in_theory=opening_hit is not None,
    )


def clear_chaos_sessions() -> None:
    """For testing only."""
    _chaos_sessions.clear()


def stop_all_maia_engines() -> None:
    """Called during app shutdown."""
    for engine in _maia_engines.values():
        engine.stop()
    _maia_engines.clear()


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------

def _get_engine_move(fen: str, elo_band: int) -> str:
    if elo_band >= STOCKFISH_BAND:
        engine = get_engine()
        if engine is None:
            raise ValueError("Stockfish engine not available")
        result = engine.analyse(fen, multipv=1, depth=15)
        move = result.get("best_move")
        if not move:
            raise ValueError("Stockfish returned no move")
        return move

    # Maia — lazy-load engine for this band
    if elo_band not in _maia_engines:
        maia = MaiaEngine(elo_band)
        maia.start()
        _maia_engines[elo_band] = maia

    return _maia_engines[elo_band].best_move(fen)


async def _build_chaos_feedback(
    session_id: str,
    pre_fen: str,
    post_fen: str,
    played_san: str,
    uci_move: str,
) -> tuple[Feedback | None, str | None]:
    if get_engine() is None:
        return None, None

    try:
        cp_loss, raw_lines, best_move_uci, debug_msg, opponent_uci = await asyncio.to_thread(
            evaluate_off_tree_eval, session_id, pre_fen, post_fen, uci_move, None
        )
    except Exception:
        return None, None
    if cp_loss <= ALTERNATIVE_THRESHOLD_CP:
        return None, debug_msg  # Good move — no feedback needed

    pre_board = chess.Board(pre_fen)
    post_board = chess.Board(post_fen)
    move = chess.Move.from_uci(uci_move)
    lines = to_analysis_lines(raw_lines, pre_board)
    best_san = lines[0].move_san if lines else (best_move_uci or uci_move)

    tactical_facts = _derive_tactical_facts(pre_board, post_board, move, opponent_uci, played_san, best_san)
    start_explanation_task(session_id, pre_fen, played_san, best_san, cp_loss, tactical_facts)
    return build_mistake_feedback(played_san, best_san, cp_loss, lines=lines), debug_msg


# Re-export for the chaos router — explanation futures are shared with study sessions.
__all__ = ["await_explanation"]
