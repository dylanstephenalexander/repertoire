from fastapi.testclient import TestClient

from app.main import app
from app.services import sessions as session_svc

client = TestClient(app)

STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
FEN_AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2"


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


def test_eval_returns_one_line(real_engine):
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    assert len(resp.json()["lines"]) == 1


def test_eval_lines_ordered_best_first(real_engine):
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    cps = [line["cp"] for line in resp.json()["lines"]]
    assert cps == sorted(cps, reverse=True)


def test_eval_san_not_uci_format(real_engine):
    """move_san must be proper SAN, not a raw UCI string like 'e2e4' or 'g1f3'."""
    import re
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    uci_pattern = re.compile(r'^[a-h][1-8][a-h][1-8][qrbn]?$')
    for line in resp.json()["lines"]:
        assert not uci_pattern.match(line["move_san"]), \
            f"move_san looks like raw UCI: {line['move_san']}"


def test_eval_non_starting_fen(real_engine):
    """Engine correctly evaluates positions other than the starting position."""
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": FEN_AFTER_E4_E5})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["lines"]) > 0
    assert data["eval_cp"] is not None


def test_eval_best_move_matches_first_line(real_engine):
    session_svc.set_engine(real_engine)
    resp = client.post("/analysis/eval", json={"fen": STARTING_FEN})
    data = resp.json()
    assert data["eval_cp"] == data["lines"][0]["cp"]


# ---------------------------------------------------------------------------
# Off-tree move feedback with real engine
# ---------------------------------------------------------------------------

def test_off_tree_move_has_lines(real_engine):
    """Off-tree move in a non-study session should include top engine lines."""
    session_svc.set_engine(real_engine)
    result = session_svc.create_session("italian", "giuoco_piano", "white", "chaos", None)
    sid = result.session_id
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
    result = session_svc.create_session("italian", "giuoco_piano", "white", "chaos", None)
    sid = result.session_id
    move_resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    board = chess.Board()
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
        },
    )
    sid = resp.json()["session_id"]
    move_resp = client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})
    assert move_resp.json()["result"] == "correct"
    assert move_resp.json()["feedback"]["lines"] is None
