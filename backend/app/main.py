import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.engine.stockfish import StockfishEngine
from app.routers import analysis, chaos, openings, review, session
from app.services.chaos import stop_all_maia_engines
from app.services.sessions import set_analysis_engine, set_engine

_engine: StockfishEngine | None = None
_analysis_engine: StockfishEngine | None = None


def _find_stockfish() -> str:
    """Resolve Stockfish binary path. Priority: env var → PATH → bundled binary."""
    if path := os.environ.get("STOCKFISH_PATH", ""):
        return path
    if path := shutil.which("stockfish"):
        return path
    bundled = Path(__file__).parent / "data" / "bin" / "stockfish"
    return str(bundled) if bundled.exists() else ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _engine, _analysis_engine
    path = _find_stockfish()
    if path:
        _engine = StockfishEngine(path=path)
        _engine.start()
        set_engine(_engine)

        _analysis_engine = StockfishEngine(path=path)
        _analysis_engine.start()
        set_analysis_engine(_analysis_engine)
    yield
    if _engine:
        _engine.stop()
    if _analysis_engine:
        _analysis_engine.stop()
    stop_all_maia_engines()


app = FastAPI(title="Repertoire", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(openings.router)
app.include_router(session.router)
app.include_router(analysis.router)
app.include_router(review.router)
app.include_router(chaos.router)
