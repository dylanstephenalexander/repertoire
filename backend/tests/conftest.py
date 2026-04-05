import pytest

from app.services import sessions as session_svc


class MockStockfishEngine:
    """Controllable stand-in for StockfishEngine in tests."""

    def __init__(self, eval_before: int = 20, eval_after: int = 0, best_move: str = "e2e4"):
        self.eval_before = eval_before
        self.eval_after = eval_after
        self._best_move = best_move
        self._call_count = 0

    def analyse(self, fen: str, moves=None) -> dict:
        # First call = pre-move eval, second = post-move eval
        if self._call_count % 2 == 0:
            result = {"eval_cp": self.eval_before, "best_move": self._best_move}
        else:
            result = {"eval_cp": self.eval_after, "best_move": self._best_move}
        self._call_count += 1
        return result

    def start(self) -> None: pass
    def stop(self) -> None: pass
    def set_elo(self, elo: int) -> None: pass
    def clear_elo(self) -> None: pass


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
    """Engine that reports a small cp loss (alternative territory)."""
    return MockStockfishEngine(eval_before=20, eval_after=-5, best_move="e2e4")


@pytest.fixture()
def engine_mistake():
    """Engine that reports a large cp loss (mistake territory)."""
    return MockStockfishEngine(eval_before=20, eval_after=60, best_move="e2e4")


@pytest.fixture()
def engine_blunder():
    """Engine that reports a very large cp loss (blunder territory)."""
    return MockStockfishEngine(eval_before=20, eval_after=200, best_move="e2e4")
