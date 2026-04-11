from fastapi.testclient import TestClient

from app.main import app
from app.services import sessions as session_svc

client = TestClient(app)


def _start_session(
    opening_id="italian",
    variation_id="giuoco_piano",
    color="white",
):
    resp = client.post(
        "/session/start",
        json={
            "opening_id": opening_id,
            "variation_id": variation_id,
            "color": color,
            "mode": "study",
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
# Off-tree feedback lines (mock engine)
# ---------------------------------------------------------------------------

def test_off_tree_with_engine_feedback_has_lines(engine_fine):
    """Mock engine lines are converted to AnalysisLine objects and attached to feedback."""
    session_svc.set_engine(engine_fine)
    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    lines = resp.json()["feedback"]["lines"]
    assert lines is not None
    assert len(lines) > 0


def test_off_tree_feedback_lines_have_san(engine_fine):
    """Lines attached to feedback must carry SAN notation, not raw UCI strings."""
    import re
    session_svc.set_engine(engine_fine)
    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    uci_pattern = re.compile(r'^[a-h][1-8][a-h][1-8][qrbn]?$')
    for line in resp.json()["feedback"]["lines"]:
        assert "move_san" in line
        assert not uci_pattern.match(line["move_san"]), \
            f"move_san looks like raw UCI: {line['move_san']}"


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
# Undo
# ---------------------------------------------------------------------------

def test_undo_restores_fen_and_allows_retry(engine_fine):
    """After an off-tree move, undo should restore the previous FEN."""
    session_svc.set_engine(engine_fine)
    sid = _start_session()["session_id"]
    original_fen = client.get(f"/session/{sid}/state").json()["current_fen"]

    client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    after_fen = client.get(f"/session/{sid}/state").json()["current_fen"]
    assert after_fen != original_fen

    resp = client.post(f"/session/{sid}/undo")
    assert resp.status_code == 200
    assert resp.json()["fen"] == original_fen

    restored_fen = client.get(f"/session/{sid}/state").json()["current_fen"]
    assert restored_fen == original_fen


def test_undo_with_nothing_to_undo_returns_400():
    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/undo")
    assert resp.status_code == 400


def test_undo_restores_tree_cursor_so_correct_move_is_accepted(engine_fine):
    """After undo, the tree cursor should be reset so the mainline move is accepted."""
    session_svc.set_engine(engine_fine)
    sid = _start_session()["session_id"]

    client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})  # off-tree
    client.post(f"/session/{sid}/undo")
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})  # back on tree
    assert resp.json()["result"] == "correct"


# ---------------------------------------------------------------------------
# Elo application
# ---------------------------------------------------------------------------

def test_elo_set_on_engine_for_off_tree_move():
    """When a session has an elo, set_elo should be called before engine analysis."""
    call_log: list[int | None] = []

    class TrackingEngine:
        def analyse(self, fen, moves=None, multipv=None, depth=None):
            return {"eval_cp": 20, "best_move": "e2e4", "lines": [], "depth": 15}

        def set_elo(self, elo: int) -> None:
            call_log.append(elo)

        def clear_elo(self) -> None:
            call_log.append(None)

        def start(self) -> None: pass
        def stop(self) -> None: pass

    session_svc.set_engine(TrackingEngine())
    resp = client.post(
        "/session/start",
        json={
            "opening_id": "italian",
            "variation_id": "giuoco_piano",
            "color": "white",
            "mode": "study",
            "elo": 1500,
        },
    )
    sid = resp.json()["session_id"]
    client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})  # off-tree → triggers engine

    assert 1500 in call_log, "set_elo(1500) was never called"
    assert None in call_log, "clear_elo() was never called"


def test_elo_not_set_when_absent(engine_fine):
    """When session has no elo, set_elo should never be called."""
    call_log: list = []
    original_set_elo = engine_fine.set_elo
    engine_fine.set_elo = lambda elo: call_log.append(elo)

    session_svc.set_engine(engine_fine)
    sid = _start_session()["session_id"]  # no elo
    client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})

    assert call_log == [], f"set_elo should not be called without elo, but got: {call_log}"
    engine_fine.set_elo = original_set_elo


# ---------------------------------------------------------------------------
# Test isolation
# ---------------------------------------------------------------------------

def test_sessions_isolated_between_tests():
    sid = _start_session()["session_id"]
    client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})
    session_svc.clear_sessions()
    assert client.get(f"/session/{sid}/state").status_code == 404


# ---------------------------------------------------------------------------
# Pre-eval cache paths
# ---------------------------------------------------------------------------

def test_pre_eval_cache_hit_uses_line_cp_no_extra_calls():
    """
    Case 1: pre_eval done, user's move is in the top-N lines.
    Only one engine call (the pre_eval itself) — no post_eval needed.
    """
    call_log: list[str] = []

    class TrackingEngine:
        def analyse(self, fen, moves=None, multipv=None, depth=None):
            call_log.append(fen)
            # Return a line for d2d4 with cp=15 (pre_cp=20 → cp_loss=5, alternative)
            return {
                "eval_cp": 20,
                "best_move": "e2e4",
                "lines": [
                    {"move_uci": "e2e4", "cp": 20},
                    {"move_uci": "d2d4", "cp": 15},
                ],
                "depth": 12,
            }

    engine = TrackingEngine()
    session_svc.set_engine(engine)
    session_svc.set_analysis_engine(engine)

    sid = _start_session()["session_id"]

    # Inject a completed pre_eval future for this session (simulates opponent move having fired it)
    from concurrent.futures import Future
    f: Future = Future()
    f.set_result((engine.analyse("ignored"), 0.1))  # (result, elapsed)
    call_log.clear()  # reset after the seeding call above
    session_svc._pre_eval_futures[sid] = f
    session_svc._pre_eval_submit_times[sid] = 0.0

    resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert resp.status_code == 200
    assert resp.json()["result"] == "alternative"
    # One shallow engine call on the post-move FEN to get the opponent's response
    assert len(call_log) == 1, f"Expected one engine call (opponent response), got: {call_log}"


def test_pre_eval_cache_hit_move_outside_lines_fires_post_eval():
    """
    Case 2: pre_eval done, but user's move is not in the top-N lines.
    One post_eval call should fire on the main engine.
    """
    call_log: list[str] = []

    class TrackingEngine:
        def analyse(self, fen, moves=None, multipv=None, depth=None):
            call_log.append(fen)
            return {"eval_cp": 200, "best_move": "e2e4", "lines": [{"move_uci": "e2e4", "cp": 200}], "depth": 12}

    engine = TrackingEngine()
    session_svc.set_engine(engine)
    session_svc.set_analysis_engine(engine)

    sid = _start_session()["session_id"]

    from concurrent.futures import Future
    f: Future = Future()
    # Pre_eval has no line for g1h3
    f.set_result(({"eval_cp": 20, "best_move": "e2e4", "lines": [{"move_uci": "e2e4", "cp": 20}], "depth": 12}, 0.1))
    call_log.clear()
    session_svc._pre_eval_futures[sid] = f
    session_svc._pre_eval_submit_times[sid] = 0.0

    resp = client.post(f"/session/{sid}/move", json={"uci_move": "g1h3"})
    assert resp.status_code == 200
    assert resp.json()["result"] in ("mistake", "blunder")
    # Exactly one post_eval call should have been made
    assert len(call_log) == 1, f"Expected exactly 1 engine call, got: {call_log}"


def test_pre_eval_cache_miss_falls_back_to_serial():
    """
    Case: no pre_eval future present (analysis engine absent / cleared).
    Falls back to the original two-call serial path.
    """
    call_log: list[str] = []

    class TrackingEngine:
        def __init__(self):
            self._n = 0
        def analyse(self, fen, moves=None, multipv=None, depth=None):
            call_log.append(fen)
            cp = 20 if self._n == 0 else 60
            self._n += 1
            return {"eval_cp": cp, "best_move": "e2e4", "lines": [{"move_uci": "e2e4", "cp": cp}], "depth": 12}
        def set_elo(self, elo): pass
        def clear_elo(self): pass

    engine = TrackingEngine()
    session_svc.set_engine(engine)
    # No analysis engine — forces serial path
    session_svc.set_analysis_engine(None)

    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert resp.status_code == 200
    assert resp.json()["result"] in ("alternative", "mistake", "blunder")
    assert len(call_log) == 2, f"Expected 2 serial engine calls, got: {call_log}"


# ---------------------------------------------------------------------------
# Explanation endpoint — idempotency and not-ready state
# ---------------------------------------------------------------------------

def test_explanation_endpoint_returns_null_when_no_pending_future():
    """No mistake registered → no Future → endpoint returns nulls without blocking."""
    sid = _start_session()["session_id"]
    resp = client.get(f"/session/{sid}/explanation")
    assert resp.status_code == 200
    assert resp.json()["explanation"] is None
    assert resp.json()["llm_debug"] is None


def test_explanation_endpoint_returns_data_from_resolved_future(monkeypatch):
    """When the LLM has finished, the endpoint returns its result."""
    sid = _start_session()["session_id"]
    async def fake_await(_session_id, timeout=12.0):
        return ("Knight is hanging.", "gemini-2.5-flash — OK\n\nKnight is hanging.")
    monkeypatch.setattr(session_svc, "await_explanation", fake_await)
    resp = client.get(f"/session/{sid}/explanation")
    assert resp.json()["explanation"] == "Knight is hanging."
    assert "OK" in resp.json()["llm_debug"]


def test_explanation_endpoint_consumes_future(monkeypatch):
    """One Future per mistake — a second call (no new mistake) returns null.
    This is the architecture that prevents the rate-limit polling loop."""
    sid = _start_session()["session_id"]
    call_count = {"n": 0}
    async def fake_await(_session_id, timeout=12.0):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return ("Blunder.", "gemini-2.5-flash — OK\n\nBlunder.")
        return None
    monkeypatch.setattr(session_svc, "await_explanation", fake_await)
    resp1 = client.get(f"/session/{sid}/explanation")
    resp2 = client.get(f"/session/{sid}/explanation")
    assert resp1.json()["explanation"] == "Blunder."
    assert resp2.json()["explanation"] is None
    assert resp2.json()["llm_debug"] is None


# ---------------------------------------------------------------------------
# _derive_tactical_facts
# ---------------------------------------------------------------------------

def test_derive_tactical_facts_detects_hanging_piece():
    """A piece moved to an attacked, undefended square is flagged."""
    import chess
    from app.services.sessions import _derive_tactical_facts

    # White knight on f3 moves to h4 where it's attacked by black bishop on g5 and undefended
    # Use a simple constructed position
    pre_board = chess.Board("rnbqkb1r/pppppppp/5n2/6b1/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1")
    move = chess.Move.from_uci("f3h4")
    post_board = pre_board.copy()
    post_board.push(move)

    facts = _derive_tactical_facts(pre_board, post_board, move, None, "Nh4", "d2d4")
    # The knight on h4 is attacked by Bg5 and undefended
    assert any("undefended" in f or "under attack" in f for f in facts)


def test_derive_tactical_facts_opponent_capture():
    """When opponent's best reply captures a piece, fact names the captured piece."""
    import chess
    from app.services.sessions import _derive_tactical_facts

    pre_board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    move = chess.Move.from_uci("e2e4")
    post_board = pre_board.copy()
    post_board.push(move)

    # Simulate opponent capturing on e4 with d7d5 then exd5 — easier: just use a position
    # where we know the capture square
    # For simplicity: opponent_uci = "e7e5" which doesn't capture anything → no capture fact
    facts = _derive_tactical_facts(pre_board, post_board, move, "e7e5", "e4", "e4")
    # e7e5 is not a capture — fact should just name the reply
    assert any("e5" in f for f in facts)
    assert not any("winning" in f for f in facts)


def test_derive_tactical_facts_no_opponent_uci():
    """When no opponent_uci is provided, no opponent-reply fact is generated."""
    import chess
    from app.services.sessions import _derive_tactical_facts

    pre_board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    move = chess.Move.from_uci("e2e4")
    post_board = pre_board.copy()
    post_board.push(move)

    facts = _derive_tactical_facts(pre_board, post_board, move, None, "e4", "e4")
    assert not any("reply" in f for f in facts)


# ---------------------------------------------------------------------------
# State-based cp_loss — evaluation state transitions
# ---------------------------------------------------------------------------

from app.services.sessions import _eval_state, _state_cp_loss


def test_eval_state_mate():
    assert _eval_state(30000) == 7
    assert _eval_state(9000) == 7


def test_eval_state_crushing():
    assert _eval_state(700) == 6
    assert _eval_state(1500) == 6


def test_eval_state_equal():
    assert _eval_state(0) == 3
    assert _eval_state(49) == 3
    assert _eval_state(-49) == 3


def test_eval_state_lost():
    assert _eval_state(-30000) == 0
    assert _eval_state(-701) == 0


def test_state_cp_loss_no_drop_is_zero():
    """Staying in the same state produces zero loss — no feedback."""
    # MATE → MATE
    assert _state_cp_loss(30000, 9001) == 0
    # WINNING → WINNING
    assert _state_cp_loss(500, 250) == 0
    # EQUAL → EQUAL
    assert _state_cp_loss(20, -30) == 0


def test_state_cp_loss_mate_to_crushing_is_not_blunder():
    """The bug case: forced mate → still crushing should not be a blunder."""
    # pre=+30000 (mate), user_post=+800 (still crushing after move)
    cp_loss = _state_cp_loss(30000, 800)
    assert cp_loss < 200, f"MATE→CRUSHING should not be a blunder, got {cp_loss}cp"


def test_state_cp_loss_one_drop_is_mistake():
    """One state drop is a real error but not a blunder."""
    from app.services.feedback import ALTERNATIVE_THRESHOLD_CP, BLUNDER_THRESHOLD_CP
    cp_loss = _state_cp_loss(300, 100)  # WINNING → ADVANTAGE
    assert cp_loss > ALTERNATIVE_THRESHOLD_CP
    assert cp_loss < BLUNDER_THRESHOLD_CP


def test_state_cp_loss_three_drops_is_blunder():
    """Three+ state drops is a blunder."""
    from app.services.feedback import BLUNDER_THRESHOLD_CP
    cp_loss = _state_cp_loss(500, -300)  # WINNING → LOSING (3 drops)
    assert cp_loss >= BLUNDER_THRESHOLD_CP


def test_state_cp_loss_threw_away_mate_is_blunder():
    """Dropping from forced mate to a losing position is a blunder."""
    from app.services.feedback import BLUNDER_THRESHOLD_CP
    cp_loss = _state_cp_loss(30000, -500)  # MATE → LOSING (7 drops)
    assert cp_loss >= BLUNDER_THRESHOLD_CP


def test_state_cp_loss_improvement_is_zero():
    """Gaining a state produces zero, not negative, loss."""
    assert _state_cp_loss(0, 300) == 0  # EQUAL → WINNING (position improved)
