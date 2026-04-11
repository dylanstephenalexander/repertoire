"""
Tests for the Chaos mode router + service layer.

All tests use mocked engines — no real Stockfish or lc0 required.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

from app.main import app
from app.services import chaos as chaos_svc
from app.services.sessions import set_engine

client = TestClient(app)

START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"


# ---------------------------------------------------------------------------
# Shared engine fakes
# ---------------------------------------------------------------------------

class MockStockfishEngine:
    """Controllable stand-in used via set_engine()."""
    def __init__(self, eval_cp: int = 20):
        self._eval_cp = eval_cp
        self._call = 0

    def analyse(self, fen, moves=None, multipv=None, depth=None):
        result = {"eval_cp": self._eval_cp if self._call % 2 == 0 else -self._eval_cp,
                  "best_move": "e2e4", "lines": [{"move_uci": "e2e4", "cp": self._eval_cp}],
                  "depth": 12}
        self._call += 1
        return result

    def set_elo(self, elo): pass
    def clear_elo(self): pass
    def start(self): pass
    def stop(self): pass


class MockMaiaEngine:
    """Returns a fixed move from best_move()."""
    def __init__(self, move: str = "e2e4"):
        self._move = move
        self.started = False

    def start(self):
        self.started = True

    def stop(self):
        self.started = False

    def best_move(self, fen, moves=None):
        return self._move


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def isolate_chaos(monkeypatch):
    """Clear chaos sessions and Maia engines before/after every test."""
    chaos_svc.clear_chaos_sessions()
    chaos_svc._maia_engines.clear()
    set_engine(None)
    yield
    chaos_svc.clear_chaos_sessions()
    chaos_svc._maia_engines.clear()
    set_engine(None)


@pytest.fixture
def stockfish():
    engine = MockStockfishEngine()
    set_engine(engine)
    return engine


# ---------------------------------------------------------------------------
# GET /chaos/engine_status
# ---------------------------------------------------------------------------

def test_engine_status_no_lc0(monkeypatch):
    monkeypatch.setattr(chaos_svc, "lc0_available", lambda: False)
    monkeypatch.setattr(chaos_svc, "available_maia_models", lambda: [])
    resp = client.get("/chaos/engine_status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["lc0"] is False
    assert data["maia_models"] == []


def test_engine_status_with_models(monkeypatch):
    monkeypatch.setattr(chaos_svc, "lc0_available", lambda: True)
    monkeypatch.setattr(chaos_svc, "available_maia_models", lambda: [1100, 1200, 1300])
    resp = client.get("/chaos/engine_status")
    assert resp.json()["lc0"] is True
    assert resp.json()["maia_models"] == [1100, 1200, 1300]


# ---------------------------------------------------------------------------
# POST /chaos/start
# ---------------------------------------------------------------------------

def test_start_chaos_white():
    resp = client.post("/chaos/start", json={"color": "white", "elo_band": 1500})
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert data["user_color"] == "white"
    assert data["fen"] == START_FEN


def test_start_chaos_black():
    resp = client.post("/chaos/start", json={"color": "black", "elo_band": 1500})
    assert resp.status_code == 200
    assert resp.json()["user_color"] == "black"


def test_start_chaos_random_resolves_color():
    resp = client.post("/chaos/start", json={"color": "random", "elo_band": 1500})
    assert resp.status_code == 200
    assert resp.json()["user_color"] in ("white", "black")


def test_start_chaos_invalid_elo():
    resp = client.post("/chaos/start", json={"color": "white", "elo_band": 999})
    assert resp.status_code == 400


def test_start_chaos_invalid_color():
    resp = client.post("/chaos/start", json={"color": "purple", "elo_band": 1500})
    assert resp.status_code == 400


def test_start_chaos_2000_band_accepted():
    resp = client.post("/chaos/start", json={"color": "white", "elo_band": 2000})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# POST /chaos/{id}/move
# ---------------------------------------------------------------------------

def _start(color="white", elo_band=2000) -> str:
    resp = client.post("/chaos/start", json={"color": color, "elo_band": elo_band})
    assert resp.status_code == 200
    return resp.json()["session_id"]


def test_chaos_move_returns_new_fen():
    sid = _start()
    resp = client.post(f"/chaos/{sid}/move", json={"uci_move": "e2e4", "feedback_enabled": False})
    assert resp.status_code == 200
    assert resp.json()["fen"] == AFTER_E4_FEN


def test_chaos_move_illegal_rejected():
    sid = _start()
    resp = client.post(f"/chaos/{sid}/move", json={"uci_move": "e2e5", "feedback_enabled": False})
    assert resp.status_code == 400


def test_chaos_move_session_not_found():
    resp = client.post("/chaos/bad-id/move", json={"uci_move": "e2e4", "feedback_enabled": False})
    assert resp.status_code == 404


def test_chaos_move_feedback_disabled_returns_none(stockfish):
    sid = _start()
    resp = client.post(f"/chaos/{sid}/move", json={"uci_move": "e2e4", "feedback_enabled": False})
    assert resp.json()["feedback"] is None


def test_chaos_move_feedback_enabled_good_move_returns_none(stockfish):
    """Good moves (low cp loss) produce no feedback even when feedback is on."""
    # Both evals the same → cp_loss ~= 0 → under threshold
    stockfish._eval_cp = 0
    sid = _start()
    resp = client.post(f"/chaos/{sid}/move", json={"uci_move": "e2e4", "feedback_enabled": True})
    assert resp.json()["feedback"] is None


def test_chaos_move_feedback_enabled_bad_move_returns_feedback():
    """Large cp swing should produce feedback when enabled."""
    engine = MockStockfishEngine(eval_cp=0)

    call_count = [0]
    original_analyse = engine.analyse
    def biased_analyse(fen, moves=None, multipv=None, depth=None):
        r = original_analyse(fen, moves, multipv, depth)
        # pre-move: eval 0 for side to move; post-move: engine sees +200 (bad for us)
        if call_count[0] == 0:
            r["eval_cp"] = 0
        else:
            r["eval_cp"] = 200  # opponent gained 200cp
        call_count[0] += 1
        return r

    engine.analyse = biased_analyse
    set_engine(engine)
    sid = _start()
    resp = client.post(f"/chaos/{sid}/move", json={"uci_move": "e2e4", "feedback_enabled": True})
    data = resp.json()
    assert data["feedback"] is not None
    assert data["feedback"]["quality"] in ("mistake", "blunder")


# ---------------------------------------------------------------------------
# POST /chaos/{id}/opponent_move — Maia path
# ---------------------------------------------------------------------------

def test_chaos_opponent_move_maia(monkeypatch):
    """Maia engine is lazy-loaded and returns its fixed move."""
    maia = MockMaiaEngine(move="e2e4")
    monkeypatch.setattr(chaos_svc, "_get_engine_move", lambda fen, elo_band: "e2e4")

    sid = _start(elo_band=1500)
    resp = client.post(f"/chaos/{sid}/opponent_move")
    assert resp.status_code == 200
    data = resp.json()
    assert data["uci_move"] == "e2e4"
    assert data["fen"] == AFTER_E4_FEN


def test_chaos_opponent_move_stockfish_band(stockfish, monkeypatch):
    """2000+ band uses Stockfish."""
    monkeypatch.setattr(chaos_svc, "_get_engine_move", lambda fen, elo_band: "e2e4")
    sid = _start(elo_band=2000)
    resp = client.post(f"/chaos/{sid}/opponent_move")
    assert resp.status_code == 200
    assert resp.json()["uci_move"] == "e2e4"


def test_chaos_opponent_move_session_not_found():
    resp = client.post("/chaos/bad-id/opponent_move")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Opening detection integration
# ---------------------------------------------------------------------------

def test_opening_name_propagated(monkeypatch):
    """If opening_detect returns a name, it should appear in the move response."""
    monkeypatch.setattr(
        "app.services.chaos.detect_opening",
        lambda fen: "Sicilian Defense"
    )
    sid = _start()
    resp = client.post(f"/chaos/{sid}/move", json={"uci_move": "e2e4", "feedback_enabled": False})
    assert resp.json()["opening_name"] == "Sicilian Defense"
    assert resp.json()["in_theory"] is True


def test_opening_name_latches(monkeypatch):
    """Once set, opening_name persists even when detect_opening returns None."""
    call_count = [0]
    def detect(fen):
        call_count[0] += 1
        return "Ruy Lopez" if call_count[0] == 1 else None
    monkeypatch.setattr("app.services.chaos.detect_opening", detect)

    sid = _start()
    client.post(f"/chaos/{sid}/move", json={"uci_move": "e2e4", "feedback_enabled": False})

    monkeypatch.setattr(chaos_svc, "_get_engine_move", lambda fen, elo_band: "e7e5")
    resp = client.post(f"/chaos/{sid}/opponent_move")
    # out of theory now but name should persist from the session
    assert resp.json()["opening_name"] == "Ruy Lopez"
    assert resp.json()["in_theory"] is False


def test_no_opening_name_initially(monkeypatch):
    monkeypatch.setattr("app.services.chaos.detect_opening", lambda fen: None)
    sid = _start()
    resp = client.post(f"/chaos/{sid}/move", json={"uci_move": "e2e4", "feedback_enabled": False})
    assert resp.json()["opening_name"] is None
    assert resp.json()["in_theory"] is False


# ---------------------------------------------------------------------------
# Maia engine routing unit tests
# ---------------------------------------------------------------------------

def test_get_engine_move_uses_stockfish_at_2000(stockfish):
    move = chaos_svc._get_engine_move(START_FEN, 2000)
    assert move == "e2e4"  # MockStockfishEngine returns e2e4 as best_move


def test_get_engine_move_lazy_loads_maia(monkeypatch):
    maia = MockMaiaEngine(move="d2d4")
    def make_maia(elo_band):
        return maia
    monkeypatch.setattr("app.services.chaos.MaiaEngine", make_maia)

    move = chaos_svc._get_engine_move(START_FEN, 1400)
    assert move == "d2d4"
    assert 1400 in chaos_svc._maia_engines


def test_get_engine_move_reuses_maia_instance(monkeypatch):
    """Second call to same elo_band must not create a new MaiaEngine."""
    created = [0]
    maia = MockMaiaEngine(move="g1f3")
    def make_maia(elo_band):
        created[0] += 1
        return maia
    monkeypatch.setattr("app.services.chaos.MaiaEngine", make_maia)

    chaos_svc._get_engine_move(START_FEN, 1300)
    chaos_svc._get_engine_move(START_FEN, 1300)
    assert created[0] == 1


def test_get_engine_move_no_stockfish_at_2000():
    """Without Stockfish, 2000-band should raise."""
    set_engine(None)
    with pytest.raises(ValueError, match="not available"):
        chaos_svc._get_engine_move(START_FEN, 2000)


# ---------------------------------------------------------------------------
# Isolation
# ---------------------------------------------------------------------------

def test_chaos_sessions_isolated_between_tests():
    sid = _start()
    chaos_svc.clear_chaos_sessions()
    resp = client.post(f"/chaos/{sid}/move", json={"uci_move": "e2e4", "feedback_enabled": False})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Explanation endpoint — idempotency and not-ready state
# ---------------------------------------------------------------------------

def test_chaos_explanation_endpoint_returns_null_when_no_pending_future():
    """No mistake registered → no Future → endpoint returns nulls without blocking."""
    sid = _start()
    resp = client.get(f"/chaos/{sid}/explanation")
    assert resp.status_code == 200
    assert resp.json()["explanation"] is None
    assert resp.json()["llm_debug"] is None


def test_chaos_explanation_endpoint_returns_data_from_resolved_future(monkeypatch):
    """When the LLM has finished, the endpoint returns its result."""
    import app.routers.chaos as chaos_router
    sid = _start()
    # Bypass the Future plumbing by monkey-patching the await helper.
    async def fake_await(_session_id, timeout=12.0):
        return ("Knight is hanging.", "gemini-2.5-flash — OK\n\nKnight is hanging.")
    monkeypatch.setattr(chaos_router, "await_explanation", fake_await)
    resp = client.get(f"/chaos/{sid}/explanation")
    assert resp.json()["explanation"] == "Knight is hanging."
    assert "OK" in resp.json()["llm_debug"]


def test_chaos_explanation_endpoint_consumes_future(monkeypatch):
    """One Future per mistake — second consecutive call (no new mistake) returns null.
    This is the architecture that prevents the rate-limit polling loop."""
    import app.routers.chaos as chaos_router
    sid = _start()
    call_count = {"n": 0}
    async def fake_await(_session_id, timeout=12.0):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return ("Blunder.", "gemini-2.5-flash — OK\n\nBlunder.")
        return None
    monkeypatch.setattr(chaos_router, "await_explanation", fake_await)
    resp1 = client.get(f"/chaos/{sid}/explanation")
    resp2 = client.get(f"/chaos/{sid}/explanation")
    assert resp1.json()["explanation"] == "Blunder."
    assert resp2.json()["explanation"] is None
    assert resp2.json()["llm_debug"] is None
