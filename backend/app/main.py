import asyncio
import logging
import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

logger = logging.getLogger(__name__)

# How often the sweep runs and the idle threshold for eviction.
_SWEEP_INTERVAL = 600   # 10 minutes
_SESSION_TTL    = 7200  # 2 hours (must match sessions.py / chaos.py)

from dotenv import find_dotenv, load_dotenv
load_dotenv(find_dotenv(usecwd=False))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

from app.engine.stockfish import StockfishEngine
from app.routers import analysis, chaos, openings, review, session
from app.services import chaos as chaos_svc
from app.services import sessions as session_svc
from app.services.chaos import stop_all_maia_engines
from app.services.llm import init_provider
from app.services.sessions import set_analysis_engine, set_engine


async def _session_sweep() -> None:
    """Background task: evict abandoned sessions every _SWEEP_INTERVAL seconds."""
    while True:
        await asyncio.sleep(_SWEEP_INTERVAL)
        n_study = session_svc.evict_stale_sessions()
        n_chaos = chaos_svc.evict_stale_chaos_sessions()
        if n_study or n_chaos:
            logger.info("Session sweep: evicted %d study, %d chaos", n_study, n_chaos)

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
    init_provider()
    path = _find_stockfish()
    if path:
        _engine = StockfishEngine(path=path)
        _engine.start()
        set_engine(_engine)

        _analysis_engine = StockfishEngine(path=path)
        _analysis_engine.start()
        set_analysis_engine(_analysis_engine)

    sweep_task = asyncio.create_task(_session_sweep())
    yield
    sweep_task.cancel()
    if _engine:
        _engine.stop()
    if _analysis_engine:
        _analysis_engine.stop()
    stop_all_maia_engines()


app = FastAPI(title="Repertoire", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
