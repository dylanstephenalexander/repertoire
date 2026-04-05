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
            skill_level=body.skill_level,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{session_id}/move", response_model=MoveResult)
def make_move(session_id: str, body: MoveRequest) -> MoveResult:
    try:
        return session_svc.process_move(session_id, body.uci_move)
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


@router.get("/{session_id}/state", response_model=SessionState)
def get_state(session_id: str) -> SessionState:
    state = session_svc.get_session(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return state
