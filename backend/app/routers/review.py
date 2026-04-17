from fastapi import APIRouter, HTTPException, Query, Request

from app.main import limiter
from app.models.review import GameSummary, ReviewRequest, ReviewResponse
from app.services import review as review_svc
from app.services.sessions import get_engine

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/games", response_model=list[GameSummary])
@limiter.limit("10/minute")
async def get_games(
    request: Request,
    username: str = Query(...),
    source: str = Query(..., pattern="^(chess.com|lichess)$"),
    year: int | None = Query(None),
    month: int | None = Query(None),
    count: int = Query(20, ge=1, le=100),
) -> list[GameSummary]:
    try:
        if source == "chess.com":
            if year is None or month is None:
                raise HTTPException(
                    status_code=422, detail="year and month required for chess.com"
                )
            return await review_svc.fetch_chess_com_games(username, year, month)
        else:
            return await review_svc.fetch_lichess_games(username, count)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upstream error: {exc}")


@router.post("/analyse", response_model=ReviewResponse)
@limiter.limit("5/minute")
async def analyse_game(request: Request, body: ReviewRequest) -> ReviewResponse:
    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Engine not available")
    try:
        return review_svc.analyse_game(body.pgn, engine)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
