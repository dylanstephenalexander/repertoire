from fastapi import APIRouter, HTTPException

from app.models.feedback import MoveResult
from app.models.session import (
    MoveRequest,
    OpponentMoveResponse,
    SessionStartRequest,
    SessionStartResponse,
    SessionState,
)
from app.services import sessions as session_svc

router = APIRouter(prefix="/session", tags=["session"])


@router.post("/start", response_model=SessionStartResponse)
def start_session(body: SessionStartRequest) -> SessionStartResponse:
    try:
        return session_svc.create_session(
            opening_id=body.opening_id,
            variation_id=body.variation_id,
            color=body.color,
            mode=body.mode,
            elo=body.elo,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{session_id}/move", response_model=MoveResult)
async def make_move(session_id: str, body: MoveRequest) -> MoveResult:
    try:
        return await session_svc.process_move(session_id, body.uci_move)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{session_id}/opponent_move", response_model=OpponentMoveResponse)
def opponent_move(session_id: str) -> OpponentMoveResponse:
    try:
        return session_svc.get_opponent_move(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{session_id}/hint")
def hint(session_id: str) -> dict:
    try:
        return session_svc.get_hint(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{session_id}/undo")
def undo_move(session_id: str) -> dict:
    try:
        fen = session_svc.undo_move(session_id)
        return {"fen": fen}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{session_id}/explanation")
async def get_explanation(session_id: str) -> dict:
    """Long-poll: blocks server-side until the LLM result is ready, or returns
    null on timeout. Clients should make ONE request per mistake — no loop."""
    result = await session_svc.await_explanation(session_id)
    if result is None:
        return {"explanation": None, "llm_debug": None}
    explanation, llm_debug = result
    return {"explanation": explanation, "llm_debug": llm_debug}


@router.get("/{session_id}/state", response_model=SessionState)
def get_state(session_id: str) -> SessionState:
    state = session_svc.get_session(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return state
