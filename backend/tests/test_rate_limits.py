"""
Rate limit tests.

Each test exhausts the limit for its endpoint and asserts a 429 is returned.
The limiter storage is reset between tests so counters don't bleed.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def _post(path: str, json: dict | None = None) -> int:
    return client.post(path, json=json or {}).status_code


def _get(path: str) -> int:
    return client.get(path).status_code


# ---------------------------------------------------------------------------
# Session router
# ---------------------------------------------------------------------------

def test_session_start_rate_limited():
    payload = {"opening_id": "x", "variation_id": "y", "color": "white", "mode": "study"}
    for _ in range(10):
        _post("/session/start", payload)
    assert _post("/session/start", payload) == 429


def test_session_move_rate_limited():
    for _ in range(120):
        _post("/session/fake-id/move", {"uci_move": "e2e4"})
    assert _post("/session/fake-id/move", {"uci_move": "e2e4"}) == 429


def test_session_opponent_move_rate_limited():
    for _ in range(60):
        _post("/session/fake-id/opponent_move")
    assert _post("/session/fake-id/opponent_move") == 429


def test_session_hint_rate_limited():
    for _ in range(30):
        _get("/session/fake-id/hint")
    assert _get("/session/fake-id/hint") == 429


def test_session_explanation_rate_limited():
    for _ in range(20):
        _get("/session/fake-id/explanation")
    assert _get("/session/fake-id/explanation") == 429


def test_session_delete_rate_limited():
    for _ in range(30):
        client.delete("/session/fake-id")
    assert client.delete("/session/fake-id").status_code == 429


def test_session_state_rate_limited():
    for _ in range(120):
        _get("/session/fake-id/state")
    assert _get("/session/fake-id/state") == 429


# ---------------------------------------------------------------------------
# Chaos router
# ---------------------------------------------------------------------------

def test_chaos_start_rate_limited():
    payload = {"color": "white", "elo_band": 1500}
    for _ in range(10):
        _post("/chaos/start", payload)
    assert _post("/chaos/start", payload) == 429


def test_chaos_engine_status_rate_limited():
    for _ in range(30):
        _get("/chaos/engine_status")
    assert _get("/chaos/engine_status") == 429


def test_chaos_move_rate_limited():
    for _ in range(120):
        _post("/chaos/fake-id/move", {"uci_move": "e2e4", "feedback_enabled": False})
    assert _post("/chaos/fake-id/move", {"uci_move": "e2e4", "feedback_enabled": False}) == 429


def test_chaos_opponent_move_rate_limited():
    for _ in range(60):
        _post("/chaos/fake-id/opponent_move")
    assert _post("/chaos/fake-id/opponent_move") == 429


def test_chaos_explanation_rate_limited():
    for _ in range(20):
        _get("/chaos/fake-id/explanation")
    assert _get("/chaos/fake-id/explanation") == 429


def test_chaos_delete_rate_limited():
    for _ in range(30):
        client.delete("/chaos/fake-id")
    assert client.delete("/chaos/fake-id").status_code == 429


# ---------------------------------------------------------------------------
# Openings router
# ---------------------------------------------------------------------------

def test_openings_list_rate_limited():
    for _ in range(60):
        _get("/openings")
    assert _get("/openings") == 429


def test_openings_tree_rate_limited():
    for _ in range(30):
        _get("/openings/italian/variations/main/tree")
    assert _get("/openings/italian/variations/main/tree") == 429


# ---------------------------------------------------------------------------
# Analysis router
# ---------------------------------------------------------------------------

def test_analysis_eval_rate_limited():
    payload = {"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}
    for _ in range(60):
        _post("/analysis/eval", payload)
    assert _post("/analysis/eval", payload) == 429


# ---------------------------------------------------------------------------
# Review router
# ---------------------------------------------------------------------------

def test_review_games_rate_limited():
    for _ in range(10):
        _get("/review/games?username=test&source=lichess")
    assert _get("/review/games?username=test&source=lichess") == 429


def test_review_analyse_rate_limited():
    payload = {"pgn": "1. e4 e5"}
    for _ in range(5):
        _post("/review/analyse", payload)
    assert _post("/review/analyse", payload) == 429
