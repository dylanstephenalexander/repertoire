"""Tests for the game review service and router."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from app.main import app
from app.models.review import GameSummary
from app.services import review as review_svc
from app.services.review import clear_analysis_cache
from app.services.sessions import get_engine, set_engine

client = TestClient(app)

# ---------------------------------------------------------------------------
# Shared fixtures / helpers
# ---------------------------------------------------------------------------

# A minimal PGN for a 3-move game (Scholar's Mate attempt)
SCHOLARS_MATE_PGN = """[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0
"""

# Minimal valid PGN (just 1 move)
ONE_MOVE_PGN = """[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 *
"""


class MockReviewEngine:
    """Controllable engine for review tests.

    Alternates between pre-move and post-move evals.
    """

    def __init__(self, pre_cp: int = 30, post_cp: int = -30):
        self.pre_cp = pre_cp
        self.post_cp = post_cp
        self._call_count = 0
        self.set_elo_calls: list = []
        self.clear_elo_calls: int = 0

    def analyse(self, fen: str, moves=None, multipv: int | None = None, depth: int | None = None) -> dict:
        if self._call_count % 2 == 0:
            cp = self.pre_cp
        else:
            cp = self.post_cp
        self._call_count += 1
        return {"eval_cp": cp, "best_move": "e2e4", "lines": [], "depth": depth or 15}

    def set_elo(self, elo: int) -> None:
        self.set_elo_calls.append(elo)

    def clear_elo(self) -> None:
        self.clear_elo_calls += 1

    def start(self) -> None: pass
    def stop(self) -> None: pass


@pytest.fixture(autouse=True)
def reset_engine():
    original = get_engine()
    yield
    set_engine(original)
    clear_analysis_cache()


# ---------------------------------------------------------------------------
# _classify
# ---------------------------------------------------------------------------

def test_classify_best():
    assert review_svc._classify(0) == "best"
    assert review_svc._classify(-5) == "best"


def test_classify_good():
    assert review_svc._classify(1) == "good"
    assert review_svc._classify(10) == "good"


def test_classify_inaccuracy():
    assert review_svc._classify(11) == "inaccuracy"
    assert review_svc._classify(25) == "inaccuracy"


def test_classify_mistake():
    assert review_svc._classify(26) == "mistake"
    assert review_svc._classify(150) == "mistake"


def test_classify_blunder():
    assert review_svc._classify(151) == "blunder"
    assert review_svc._classify(500) == "blunder"


# ---------------------------------------------------------------------------
# _explain
# ---------------------------------------------------------------------------

def test_explain_best_returns_none():
    assert review_svc._explain("best", "e4", "e4", 0) is None


def test_explain_good_returns_none():
    assert review_svc._explain("good", "e4", "e4", 5) is None


def test_explain_mistake_includes_cp():
    result = review_svc._explain("mistake", "d4", "e4", 80)
    assert result is not None
    assert "80" in result
    assert "e4" in result


def test_explain_blunder():
    result = review_svc._explain("blunder", "Qh5", "Nf3", 200)
    assert result is not None
    assert "Qh5" in result
    assert "Nf3" in result


# ---------------------------------------------------------------------------
# analyse_game (unit — mocked engine)
# ---------------------------------------------------------------------------

def test_analyse_game_returns_correct_structure():
    engine = MockReviewEngine(pre_cp=30, post_cp=-30)
    result = review_svc.analyse_game(ONE_MOVE_PGN, "intermediate", engine)
    assert result.white == "Alice"
    assert result.black == "Bob"
    assert len(result.moves) == 1


def test_analyse_game_one_move_best():
    # pre=30, post=-30 → cp_loss = max(0, 30 + (-30)) = 0 → "best"
    engine = MockReviewEngine(pre_cp=30, post_cp=-30)
    result = review_svc.analyse_game(ONE_MOVE_PGN, "intermediate", engine)
    move = result.moves[0]
    assert move.quality == "best"
    assert move.cp_loss is None
    assert move.explanation is None
    assert move.color == "white"
    assert move.move_san == "e4"


def test_analyse_game_one_move_mistake():
    # pre=30, post=70 → cp_loss = max(0, 30 + 70) = 100 → "mistake"
    engine = MockReviewEngine(pre_cp=30, post_cp=70)
    result = review_svc.analyse_game(ONE_MOVE_PGN, "intermediate", engine)
    move = result.moves[0]
    assert move.quality == "mistake"
    assert move.cp_loss == 100
    assert move.explanation is not None


def test_analyse_game_eval_cp_white_perspective():
    # After white's move: post_cp=-30 (from black's perspective) → white's eval = -(-30) = 30
    engine = MockReviewEngine(pre_cp=30, post_cp=-30)
    result = review_svc.analyse_game(ONE_MOVE_PGN, "intermediate", engine)
    assert result.moves[0].eval_cp == 30  # white is +30


def test_analyse_game_full_game_move_count():
    engine = MockReviewEngine()
    result = review_svc.analyse_game(SCHOLARS_MATE_PGN, "intermediate", engine)
    # Scholar's mate: 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7# = 7 moves total
    assert len(result.moves) == 7


def test_analyse_game_alternates_colors():
    engine = MockReviewEngine()
    result = review_svc.analyse_game(SCHOLARS_MATE_PGN, "intermediate", engine)
    colors = [m.color for m in result.moves]
    assert colors[0] == "white"
    assert colors[1] == "black"
    assert colors[2] == "white"


def test_analyse_game_multipv_1_used():
    """Engine should be called with multipv=1 for efficiency."""
    recorded: list[int | None] = []

    class TrackingEngine(MockReviewEngine):
        def analyse(self, fen, moves=None, multipv=None, depth=None):
            recorded.append(multipv)
            return super().analyse(fen, moves, multipv, depth)

    engine = TrackingEngine()
    review_svc.analyse_game(ONE_MOVE_PGN, "intermediate", engine)
    assert all(m == 1 for m in recorded), f"Expected all multipv=1, got {recorded}"


def test_analyse_game_invalid_pgn():
    engine = MockReviewEngine()
    # Empty string causes read_game to return None
    with pytest.raises(ValueError, match="Could not parse PGN"):
        review_svc.analyse_game("", "intermediate", engine)


def test_analyse_game_fen_before_is_position_before_move():
    engine = MockReviewEngine()
    result = review_svc.analyse_game(ONE_MOVE_PGN, "intermediate", engine)
    # First move is from starting position
    import chess
    assert result.moves[0].fen_before == chess.Board().fen()


# ---------------------------------------------------------------------------
# Router — /review/analyse
# ---------------------------------------------------------------------------

def test_router_analyse_no_engine_returns_503():
    set_engine(None)
    resp = client.post("/review/analyse", json={"pgn": ONE_MOVE_PGN})
    assert resp.status_code == 503


def test_router_analyse_invalid_pgn_returns_400():
    set_engine(MockReviewEngine())
    resp = client.post("/review/analyse", json={"pgn": ""})
    assert resp.status_code == 400


def test_router_analyse_returns_review_response():
    set_engine(MockReviewEngine(pre_cp=30, post_cp=-30))
    resp = client.post(
        "/review/analyse",
        json={"pgn": ONE_MOVE_PGN},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["white"] == "Alice"
    assert data["black"] == "Bob"
    assert len(data["moves"]) == 1
    move = data["moves"][0]
    assert move["move_san"] == "e4"
    assert move["quality"] == "best"
    assert "fen_before" in move


def test_router_analyse_blunder_has_explanation():
    set_engine(MockReviewEngine(pre_cp=30, post_cp=100))  # big cp_loss → blunder
    resp = client.post("/review/analyse", json={"pgn": ONE_MOVE_PGN})
    assert resp.status_code == 200
    move = resp.json()["moves"][0]
    assert move["explanation"] is not None


# ---------------------------------------------------------------------------
# Router — /review/games (mocked HTTP)
# ---------------------------------------------------------------------------

MOCK_CHESS_COM_RESPONSE = {
    "games": [
        {
            "url": "https://www.chess.com/game/live/1",
            "pgn": ONE_MOVE_PGN,
            "white": {"username": "alice", "result": "win"},
            "black": {"username": "bob", "result": "checkmated"},
            "time_class": "rapid",
            "end_time": "2024-01-15T12:00:00Z",
        }
    ]
}


@pytest.mark.anyio
async def test_fetch_chess_com_games():
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_response = AsyncMock()
        mock_response.json = lambda: MOCK_CHESS_COM_RESPONSE
        mock_response.raise_for_status = lambda: None
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        games = await review_svc.fetch_chess_com_games("alice", 2024, 1)

    assert len(games) == 1
    assert games[0].white == "alice"
    assert games[0].black == "bob"
    assert games[0].result == "1-0"
    assert games[0].time_class == "rapid"


def test_router_games_missing_year_month_for_chess_com():
    resp = client.get("/review/games?username=alice&source=chess.com")
    assert resp.status_code == 422


def test_router_games_invalid_source():
    resp = client.get("/review/games?username=alice&source=chess24")
    assert resp.status_code == 422
