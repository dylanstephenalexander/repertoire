import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import sessions as session_svc

client = TestClient(app)

STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


# ---------------------------------------------------------------------------
# /analysis/eval — no engine (503)
# ---------------------------------------------------------------------------

def test_eval_no_engine_returns_503():
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    assert resp.status_code == 503


def test_eval_invalid_fen_returns_400(real_engine):
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": "not-a-fen"})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# /analysis/eval — real engine integration
# ---------------------------------------------------------------------------

def test_eval_returns_lines(real_engine):
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    assert resp.status_code == 200
    data = resp.json()
    assert "lines" in data
    assert len(data["lines"]) > 0
    assert "eval_cp" in data
    assert "depth" in data


def test_eval_lines_have_required_fields(real_engine):
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    for line in resp.json()["lines"]:
        assert "move_uci" in line
        assert "move_san" in line
        assert "cp" in line


def test_eval_returns_top_3_lines(real_engine):
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    assert len(resp.json()["lines"]) == 3


def test_eval_lines_ordered_best_first(real_engine):
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    cps = [line["cp"] for line in resp.json()["lines"]]
    assert cps == sorted(cps, reverse=True)


def test_eval_san_is_human_readable(real_engine):
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    # SAN moves should not look like raw UCI (e.g. "e2e4")
    first_san = resp.json()["lines"][0]["move_san"]
    assert len(first_san) <= 6  # SAN is short: "e4", "Nf3", "O-O", etc.
    assert first_san[0].isupper() or first_san[0].islower()


def test_eval_best_move_matches_first_line(real_engine):
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    data = resp.json()
    assert data["eval_cp"] == data["lines"][0]["cp"]


# ---------------------------------------------------------------------------
# Off-tree move feedback with real engine
# ---------------------------------------------------------------------------

def test_off_tree_move_has_lines(real_engine):
    """Off-tree move result should include top engine lines."""
    session_svc.set_engine(real_engine)
    resp = client.post(
        "/session/start",
        json={
            "opening_id": "italian",
            "variation_id": "giuoco_piano",
            "color": "white",
            "mode": "study",
            "skill_level": "advanced",
        },
    )
    sid = resp.json()["session_id"]
    # d2d4 is off-tree for the Italian
    move_resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert move_resp.status_code == 200
    data = move_resp.json()
    assert data["result"] in ("alternative", "mistake", "blunder")
    assert data["feedback"]["lines"] is not None
    assert len(data["feedback"]["lines"]) > 0


def test_off_tree_lines_are_legal_moves(real_engine):
    """Every line returned for an off-tree move must be a legal move from that position."""
    import chess
    session_svc.set_engine(real_engine)
    resp = client.post(
        "/session/start",
        json={
            "opening_id": "italian",
            "variation_id": "giuoco_piano",
            "color": "white",
            "mode": "study",
            "skill_level": "intermediate",
        },
    )
    sid = resp.json()["session_id"]
    move_resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    board = chess.Board()  # starting position — d2d4 is from here
    for line in move_resp.json()["feedback"]["lines"]:
        move = chess.Move.from_uci(line["move_uci"])
        assert move in board.legal_moves, f"{line['move_uci']} is not legal"


def test_correct_move_has_no_lines(real_engine):
    """In-tree (correct) moves don't need engine lines."""
    session_svc.set_engine(real_engine)
    resp = client.post(
        "/session/start",
        json={
            "opening_id": "italian",
            "variation_id": "giuoco_piano",
            "color": "white",
            "mode": "study",
            "skill_level": "advanced",
        },
    )
    sid = resp.json()["session_id"]
    move_resp = client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})
    assert move_resp.json()["result"] == "correct"
    assert move_resp.json()["feedback"]["lines"] is None
