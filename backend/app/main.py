from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.engine.stockfish import StockfishEngine
from app.routers import analysis, openings, session
from app.services.sessions import set_engine

_engine: StockfishEngine | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _engine
    import os
    path = os.environ.get("STOCKFISH_PATH", "")
    if not path:
        # Fall back to bundled binary for non-dev deployments
        bundled = Path(__file__).parent / "data" / "bin" / "stockfish"
        path = str(bundled) if bundled.exists() else ""
    if path:
        _engine = StockfishEngine(path=path)
        _engine.start()
        set_engine(_engine)
    yield
    if _engine:
        _engine.stop()


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
