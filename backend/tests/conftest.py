import os

import pytest

from app.engine.stockfish import StockfishEngine
from app.main import limiter
from app.services import sessions as session_svc

STOCKFISH_PATH = os.environ.get("STOCKFISH_PATH", "")


class MockStockfishEngine:
    """Controllable stand-in for StockfishEngine in tests."""

    def __init__(
        self,
        eval_before: int = 20,
        eval_after: int = 0,
        lines_before: list[dict] | None = None,
    ):
        self.eval_before = eval_before
        self.eval_after = eval_after
        # Default to one plausible line if not specified
        self.lines_before = lines_before or [
            {"move_uci": "e2e4", "cp": eval_before},
            {"move_uci": "d2d4", "cp": eval_before - 5},
            {"move_uci": "g1f3", "cp": eval_before - 10},
        ]
        self._call_count = 0

    def analyse(self, fen: str, moves=None, multipv=None, depth=None) -> dict:
        # First call = pre-move position, second = post-move position
        if self._call_count % 2 == 0:
            result = {
                "eval_cp": self.eval_before,
                "best_move": self.lines_before[0]["move_uci"],
                "lines": self.lines_before,
            }
        else:
            result = {"eval_cp": self.eval_after, "best_move": None, "lines": []}
        self._call_count += 1
        return result

    def start(self) -> None: pass
    def stop(self) -> None: pass
    def set_elo(self, elo: int) -> None: pass
    def clear_elo(self) -> None: pass


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Reset rate limit counters between every test."""
    yield
    limiter._storage.reset()


@pytest.fixture(autouse=True)
def isolate_sessions():
    """Clear session store and reset engine before/after every test."""
    session_svc.clear_sessions()
    session_svc.set_engine(None)
    yield
    session_svc.clear_sessions()
    session_svc.set_engine(None)


@pytest.fixture()
def engine_fine():
    return MockStockfishEngine(eval_before=20, eval_after=-5)


@pytest.fixture()
def engine_mistake():
    # 1 state drop = mistake: pre=+200 (WINNING, state 5), user_post=+60 (ADVANTAGE, state 4)
    # post is from opponent's POV, so eval_after = -60
    return MockStockfishEngine(eval_before=200, eval_after=-60)


@pytest.fixture()
def engine_blunder():
    # 3+ state drops = blunder: pre=+500 (WINNING, state 5), user_post=-300 (LOSING, state 1) = 4 drops
    # post from opponent's POV = +300, so eval_after=300
    return MockStockfishEngine(eval_before=500, eval_after=300)


@pytest.fixture()
def real_engine():
    """Real Stockfish engine. Skipped if STOCKFISH_PATH is not set."""
    if not STOCKFISH_PATH:
        pytest.skip("STOCKFISH_PATH not set")
    engine = StockfishEngine(path=STOCKFISH_PATH)
    engine.start()
    yield engine
    engine.stop()
