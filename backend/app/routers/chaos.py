from fastapi import APIRouter, HTTPException

from app.models.chaos import (
    ChaosOpponentMoveResponse,
    ChaosMoveRequest,
    ChaosMoveResponse,
    ChaosStartRequest,
    ChaosStartResponse,
    EngineStatusResponse,
)
from app.services import chaos as chaos_svc
from app.services.sessions import await_explanation

router = APIRouter(prefix="/chaos", tags=["chaos"])

VALID_ELO_BANDS = {1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000}


@router.get("/engine_status", response_model=EngineStatusResponse)
def engine_status() -> EngineStatusResponse:
    status = chaos_svc.engine_status()
    return EngineStatusResponse(**status)


@router.post("/start", response_model=ChaosStartResponse)
def start_chaos(body: ChaosStartRequest) -> ChaosStartResponse:
    if body.elo_band not in VALID_ELO_BANDS:
        raise HTTPException(status_code=400, detail=f"Invalid elo_band: {body.elo_band}")
    if body.color not in ("white", "black", "random"):
        raise HTTPException(status_code=400, detail=f"Invalid color: {body.color}")
    try:
        return chaos_svc.create_chaos_session(
            color=body.color,
            elo_band=body.elo_band,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{session_id}/explanation")
async def get_chaos_explanation(session_id: str) -> dict:
    """Long-poll: blocks server-side until the LLM result is ready, or returns
    null on timeout. Clients should make ONE request per mistake — no loop."""
    result = await await_explanation(session_id)
    if result is None:
        return {"explanation": None, "llm_debug": None}
    explanation, llm_debug = result
    return {"explanation": explanation, "llm_debug": llm_debug}


@router.post("/{session_id}/move", response_model=ChaosMoveResponse)
async def make_chaos_move(session_id: str, body: ChaosMoveRequest) -> ChaosMoveResponse:
    try:
        return await chaos_svc.process_chaos_move(
            session_id=session_id,
            uci_move=body.uci_move,
            feedback_enabled=body.feedback_enabled,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{session_id}/opponent_move", response_model=ChaosOpponentMoveResponse)
def chaos_opponent_move(session_id: str) -> ChaosOpponentMoveResponse:
    try:
        return chaos_svc.get_chaos_opponent_move(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
