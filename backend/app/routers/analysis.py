import chess
from fastapi import APIRouter, HTTPException


from app.engine.stockfish import EVAL_BAR_DEPTH
from app.models.analysis import EvalRequest, EvalResponse
from app.models.feedback import AnalysisLine
from app.services.sessions import get_engine

router = APIRouter(prefix="/analysis", tags=["analysis"])

# FEN → eval result cache. Keyed on raw FEN string (includes side-to-move, castling, etc.)
# Cleared on server restart; fine for MVP since positions repeat constantly in opening drills.
_eval_cache: dict[str, EvalResponse] = {}


@router.post("/eval", response_model=EvalResponse)
def eval_position(body: EvalRequest) -> EvalResponse:
    try:
        board = chess.Board(body.fen)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN")

    if body.fen in _eval_cache:
        return _eval_cache[body.fen]

    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Engine not available")

    result = engine.analyse(body.fen, multipv=1, depth=EVAL_BAR_DEPTH)

    lines: list[AnalysisLine] = []
    for raw in result.get("lines", []):
        uci = raw["move_uci"]
        try:
            san = board.san(chess.Move.from_uci(uci))
        except Exception:
            san = uci
        lines.append(AnalysisLine(move_uci=uci, move_san=san, cp=raw["cp"]))

    response = EvalResponse(
        lines=lines,
        depth=result.get("depth", 0),
        eval_cp=result.get("eval_cp"),
    )
    _eval_cache[body.fen] = response
    return response
