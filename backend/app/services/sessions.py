import uuid
from typing import Any

import chess

from app.engine.stockfish import StockfishEngine
from app.models.feedback import Feedback, MoveResult
from app.models.session import OpponentMoveResponse, SessionStartResponse, SessionState
from app.services.feedback import (
    ALTERNATIVE_THRESHOLD_CP,
    build_alternative_feedback,
    build_correct_feedback,
    build_mistake_feedback,
)
from app.services.openings import get_variation_tree

# In-memory session store
_sessions: dict[str, SessionState] = {}

# Shared engine instance (set during app lifespan)
_engine: StockfishEngine | None = None


def set_engine(engine: StockfishEngine) -> None:
    global _engine
    _engine = engine


def get_engine() -> StockfishEngine | None:
    return _engine


def clear_sessions() -> None:
    """Clear all in-memory sessions. For testing only."""
    _sessions.clear()


def create_session(
    opening_id: str,
    variation_id: str,
    color: str,
    mode: str,
    elo: int | None,
    skill_level: str,
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
        skill_level=skill_level,
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


def process_move(session_id: str, uci_move: str) -> MoveResult:
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
        session.tree_cursor = session.tree_cursor[uci_move] or {}
        session.score += 1
        feedback = build_correct_feedback(session.skill_level, played_san)
        _update_session(session, uci_move, new_fen, session.tree_cursor)
        return MoveResult(result="correct", feedback=feedback, fen=new_fen)

    # Off-tree: evaluate with Stockfish
    if _engine is None:
        feedback = Feedback(
            quality="mistake",
            explanation=f"{played_san} is off the main line.",
            centipawn_loss=None,
            best_move=_first_tree_move(session.tree_cursor),
        )
        _update_session(session, uci_move, new_fen, {})
        return MoveResult(result="mistake", feedback=feedback, fen=new_fen)

    pre_move_eval = _engine.analyse(session.current_fen)
    post_move_eval = _engine.analyse(new_fen)

    pre_cp = pre_move_eval["eval_cp"] or 0
    post_cp = post_move_eval["eval_cp"] or 0
    cp_loss = max(0, pre_cp + post_cp)

    best_uci = pre_move_eval["best_move"]
    best_san: str | None = None
    if best_uci:
        b = chess.Board(session.current_fen)
        try:
            best_san = b.san(chess.Move.from_uci(best_uci))
        except Exception:
            best_san = best_uci

    mainline_uci = _first_tree_move(session.tree_cursor)
    mainline_san: str | None = None
    if mainline_uci:
        b = chess.Board(session.current_fen)
        try:
            mainline_san = b.san(chess.Move.from_uci(mainline_uci))
        except Exception:
            mainline_san = mainline_uci

    if cp_loss <= ALTERNATIVE_THRESHOLD_CP:
        feedback = build_alternative_feedback(
            session.skill_level,
            played_san,
            mainline_san or (best_san or uci_move),
            cp_loss,
        )
        result = "alternative"
    else:
        feedback = build_mistake_feedback(
            session.skill_level,
            played_san,
            best_san or uci_move,
            cp_loss,
        )
        result = feedback.quality

    _update_session(session, uci_move, new_fen, {})
    return MoveResult(
        result=result,
        feedback=feedback,
        fen=new_fen,
        eval_cp=post_cp,
        best_move=best_uci,
    )


def get_opponent_move(session_id: str) -> OpponentMoveResponse:
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")

    uci_move = _first_tree_move(session.tree_cursor)
    if uci_move is None:
        raise ValueError("No opponent move available — end of opening line")

    board = chess.Board(session.current_fen)
    board.push(chess.Move.from_uci(uci_move))
    new_fen = board.fen()

    next_cursor = session.tree_cursor.get(uci_move) or {}
    _update_session(session, uci_move, new_fen, next_cursor)
    return OpponentMoveResponse(uci_move=uci_move, fen=new_fen)


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
