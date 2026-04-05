import chess
from fastapi import APIRouter, HTTPException

from app.engine.stockfish import DEFAULT_DEPTH, DEFAULT_MULTIPV
from app.models.analysis import EvalRequest, EvalResponse
from app.models.feedback import AnalysisLine
from app.services.sessions import get_engine

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/eval", response_model=EvalResponse)
def eval_position(body: EvalRequest) -> EvalResponse:
    try:
        board = chess.Board(body.fen)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN")

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Engine not available")

    result = engine.analyse(body.fen)

    lines: list[AnalysisLine] = []
    for raw in result.get("lines", []):
        uci = raw["move_uci"]
        try:
            san = board.san(chess.Move.from_uci(uci))
        except Exception:
            san = uci
        lines.append(AnalysisLine(move_uci=uci, move_san=san, cp=raw["cp"]))

    return EvalResponse(
        lines=lines,
        depth=DEFAULT_DEPTH,
        eval_cp=result.get("eval_cp"),
    )
