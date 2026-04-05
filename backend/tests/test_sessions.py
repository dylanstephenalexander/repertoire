from fastapi.testclient import TestClient

from app.main import app
from app.services import sessions as session_svc

client = TestClient(app)


def _start_session(
    opening_id="italian",
    variation_id="giuoco_piano",
    color="white",
    skill_level="beginner",
):
    resp = client.post(
        "/session/start",
        json={
            "opening_id": opening_id,
            "variation_id": variation_id,
            "color": color,
            "mode": "study",
            "skill_level": skill_level,
        },
    )
    assert resp.status_code == 200
    return resp.json()


# ---------------------------------------------------------------------------
# Session creation
# ---------------------------------------------------------------------------

def test_start_session_returns_required_fields():
    data = _start_session()
    assert "session_id" in data
    assert "fen" in data
    assert "to_move" in data
    assert data["to_move"] == "white"


def test_start_session_invalid_opening():
    resp = client.post(
        "/session/start",
        json={"opening_id": "nope", "variation_id": "nope", "color": "white", "mode": "study"},
    )
    assert resp.status_code == 400


def test_start_session_invalid_variation():
    resp = client.post(
        "/session/start",
        json={"opening_id": "italian", "variation_id": "nope", "color": "white", "mode": "study"},
    )
    assert resp.status_code == 400


def test_session_state_includes_variation_id():
    session = _start_session()
    state = client.get(f"/session/{session['session_id']}/state").json()
    assert state["opening_id"] == "italian"
    assert state["variation_id"] == "giuoco_piano"


# ---------------------------------------------------------------------------
# Correct moves
# ---------------------------------------------------------------------------

def test_correct_move():
    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})
    assert resp.status_code == 200
    assert resp.json()["result"] == "correct"


def test_correct_move_increments_score():
    sid = _start_session()["session_id"]
    client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})
    assert client.get(f"/session/{sid}/state").json()["score"] == 1


def test_off_tree_move_does_not_increment_score():
    sid = _start_session()["session_id"]
    client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert client.get(f"/session/{sid}/state").json()["score"] == 0


# ---------------------------------------------------------------------------
# Off-tree move classification via mocked engine
# ---------------------------------------------------------------------------

def test_off_tree_no_engine_returns_mistake():
    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert resp.json()["result"] in ("alternative", "mistake", "blunder")


def test_off_tree_low_cp_loss_is_alternative(engine_fine):
    session_svc.set_engine(engine_fine)
    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert resp.json()["result"] == "alternative"


def test_off_tree_high_cp_loss_is_mistake(engine_mistake):
    session_svc.set_engine(engine_mistake)
    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert resp.json()["result"] == "mistake"


def test_off_tree_blunder_cp_loss(engine_blunder):
    session_svc.set_engine(engine_blunder)
    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert resp.json()["result"] == "blunder"


# ---------------------------------------------------------------------------
# Illegal moves / errors
# ---------------------------------------------------------------------------

def test_illegal_move_rejected():
    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "e2e5"})
    assert resp.status_code == 400


def test_move_session_not_found():
    resp = client.post("/session/bad-id/move", json={"uci_move": "e2e4"})
    assert resp.status_code == 404


def test_get_state_not_found():
    resp = client.get("/session/bad-id/state")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Move history
# ---------------------------------------------------------------------------

def test_move_history_updated():
    sid = _start_session()["session_id"]
    client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})
    assert "e2e4" in client.get(f"/session/{sid}/state").json()["move_history"]


# ---------------------------------------------------------------------------
# Opponent move
# ---------------------------------------------------------------------------

def test_opponent_move_returns_tree_move():
    sid = _start_session()["session_id"]
    client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})
    resp = client.post(f"/session/{sid}/opponent_move")
    assert resp.status_code == 200
    data = resp.json()
    assert "uci_move" in data
    assert "fen" in data
    assert data["uci_move"] == "e7e5"


def test_opponent_move_at_end_of_line_returns_400():
    sid = _start_session()["session_id"]
    session_svc.get_session(sid).tree_cursor = {}
    resp = client.post(f"/session/{sid}/opponent_move")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Full line walkthrough
# ---------------------------------------------------------------------------

def test_full_giuoco_piano_opening():
    """1.e4 e5 2.Nf3 Nc6 3.Bc4 — all white moves correct, black responses match tree."""
    sid = _start_session()["session_id"]

    assert client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"}).json()["result"] == "correct"
    assert client.post(f"/session/{sid}/opponent_move").json()["uci_move"] == "e7e5"
    assert client.post(f"/session/{sid}/move", json={"uci_move": "g1f3"}).json()["result"] == "correct"
    assert client.post(f"/session/{sid}/opponent_move").json()["uci_move"] == "b8c6"
    assert client.post(f"/session/{sid}/move", json={"uci_move": "f1c4"}).json()["result"] == "correct"


def test_najdorf_variation_session():
    """Sicilian Najdorf — black variation, starts with white to move."""
    data = _start_session(opening_id="sicilian", variation_id="najdorf", color="black")
    assert data["to_move"] == "white"
    state = client.get(f"/session/{data['session_id']}/state").json()
    assert state["opening_id"] == "sicilian"
    assert state["variation_id"] == "najdorf"


# ---------------------------------------------------------------------------
# Skill level
# ---------------------------------------------------------------------------

def test_beginner_explanation_no_jargon():
    sid = _start_session(skill_level="beginner")["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})
    explanation = resp.json()["feedback"]["explanation"]
    assert "cp" not in explanation


# ---------------------------------------------------------------------------
# Test isolation
# ---------------------------------------------------------------------------

def test_sessions_isolated_between_tests():
    sid = _start_session()["session_id"]
    client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})
    session_svc.clear_sessions()
    assert client.get(f"/session/{sid}/state").status_code == 404
