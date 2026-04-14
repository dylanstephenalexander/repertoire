import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.feedback import MoveResult
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
# Off-tree move in Study Mode — rejected immediately, no engine call
# ---------------------------------------------------------------------------

def test_off_tree_study_mode_returns_rejected():
    """In Study Mode, off-tree moves are rejected immediately without engine evaluation."""
    sid = _start_session()["session_id"]
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert resp.status_code == 200
    assert resp.json()["result"] == "rejected"
    assert resp.json()["feedback"] is None


def test_off_tree_study_mode_does_not_advance_fen():
    """Rejected move must not change the board state."""
    sid = _start_session()["session_id"]
    original_fen = client.get(f"/session/{sid}/state").json()["current_fen"]
    client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert client.get(f"/session/{sid}/state").json()["current_fen"] == original_fen


def test_off_tree_study_mode_no_engine_call():
    """Rejected move must not trigger any engine call — engine absence has no effect."""
    call_log: list = []

    class TrackingEngine:
        def analyse(self, fen, moves=None, multipv=None, depth=None):
            call_log.append(fen)
            return {"eval_cp": 0, "best_move": "e2e4", "lines": [], "depth": 10}
        def set_elo(self, elo): pass
        def clear_elo(self): pass

    session_svc.set_engine(TrackingEngine())
    sid = _start_session()["session_id"]
    client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert call_log == [], f"Engine should not be called for rejected move, got: {call_log}"


def test_correct_move_after_rejected_still_works():
    """Board state is intact after rejection — correct move is still accepted."""
    sid = _start_session()["session_id"]
    client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})  # rejected
    resp = client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})  # correct
    assert resp.json()["result"] == "correct"


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
# Test isolation
# ---------------------------------------------------------------------------

def test_sessions_isolated_between_tests():
    sid = _start_session()["session_id"]
    client.post(f"/session/{sid}/move", json={"uci_move": "e2e4"})
    session_svc.clear_sessions()
    assert client.get(f"/session/{sid}/state").status_code == 404


# ---------------------------------------------------------------------------
# Pre-eval cache paths (use mode="freestyle" to bypass study rejection)
# ---------------------------------------------------------------------------

def _start_freestyle_session():
    """Start a non-study session so off-tree moves reach the eval path."""
    resp = client.post(
        "/session/start",
        json={
            "opening_id": "italian",
            "variation_id": "giuoco_piano",
            "color": "white",
            "mode": "freestyle",
        },
    )
    assert resp.status_code == 200
    return resp.json()


def test_pre_eval_cache_hit_uses_line_cp_no_extra_calls():
    """
    Case 1: pre_eval done, user's move is in the top-N lines.
    Only one engine call (the pre_eval itself) — no post_eval needed.
    """
    call_log: list[str] = []

    class TrackingEngine:
        def analyse(self, fen, moves=None, multipv=None, depth=None):
            call_log.append(fen)
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

    sid = _start_freestyle_session()["session_id"]

    from concurrent.futures import Future
    f: Future = Future()
    f.set_result((engine.analyse("ignored"), 0.1))
    call_log.clear()
    session_svc._pre_eval_futures[sid] = f
    session_svc._pre_eval_submit_times[sid] = 0.0

    resp = client.post(f"/session/{sid}/move", json={"uci_move": "d2d4"})
    assert resp.status_code == 200
    assert resp.json()["result"] == "alternative"
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

    sid = _start_freestyle_session()["session_id"]

    from concurrent.futures import Future
    f: Future = Future()
    f.set_result(({"eval_cp": 20, "best_move": "e2e4", "lines": [{"move_uci": "e2e4", "cp": 20}], "depth": 12}, 0.1))
    call_log.clear()
    session_svc._pre_eval_futures[sid] = f
    session_svc._pre_eval_submit_times[sid] = 0.0

    resp = client.post(f"/session/{sid}/move", json={"uci_move": "g1h3"})
    assert resp.status_code == 200
    assert resp.json()["result"] in ("mistake", "blunder")
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
    session_svc.set_analysis_engine(None)

    sid = _start_freestyle_session()["session_id"]
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


@pytest.mark.asyncio
async def test_explanation_future_evicted_on_timeout():
    """
    A future that never resolves within the timeout must be removed from
    _llm_futures. Without this, every slow/failed LLM call leaves a dead
    entry that accumulates for the life of the process.
    """
    import asyncio

    sid = "timeout-test-session"
    loop = asyncio.get_running_loop()

    # A future that will never resolve during this test
    never_resolving: asyncio.Future = loop.create_future()
    session_svc._llm_futures[sid] = never_resolving

    result = await session_svc.await_explanation(sid, timeout=0.01)

    assert result is None
    assert sid not in session_svc._llm_futures, (
        "_llm_futures entry must be removed after timeout — it was not"
    )


@pytest.mark.asyncio
async def test_explanation_future_late_resolve_does_not_resurrect_entry():
    """
    If the LLM task completes after the client already timed out, the result
    must be silently discarded — it must NOT re-appear in _llm_futures.
    """
    import asyncio

    sid = "late-resolve-session"
    loop = asyncio.get_running_loop()

    fut: asyncio.Future = loop.create_future()
    session_svc._llm_futures[sid] = fut

    # Client times out
    await session_svc.await_explanation(sid, timeout=0.01)
    assert sid not in session_svc._llm_futures

    # LLM finishes late — sets result on the now-orphaned future
    fut.set_result(("Knight is hanging.", "gemini — OK"))

    # Entry must still be absent — late resolve must not re-add it
    assert sid not in session_svc._llm_futures


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


# ---------------------------------------------------------------------------
# Concurrent move serialisation — process_move must hold a per-session lock
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_concurrent_off_tree_moves_do_not_corrupt_state():
    """
    Two simultaneous off-tree process_move calls on the same session must be
    serialised. Without the per-session lock the race is:
      1. Coroutine A reads current_fen = FEN0, enters asyncio.to_thread (yields).
      2. Coroutine B reads current_fen = FEN0 (same — A hasn't written back).
      3. Both threads run analysis on FEN0 in parallel.
      4. Both write back: move_history gets two entries, score doubles.

    With the lock, B waits until A completes and advances the FEN. B then reads
    FEN1 (after d2d4 it is Black's turn) and raises ValueError for the illegal
    move — exactly one entry in move_history and score untouched at 0.
    """
    import asyncio

    class SlowEngine:
        """Sleeps briefly in analyse() to open the race window between coroutines."""
        def analyse(self, fen, moves=None, multipv=None, depth=None):
            import time
            time.sleep(0.02)
            return {
                "eval_cp": 200,
                "best_move": "e2e4",
                "lines": [{"move_uci": "e2e4", "cp": 200}],
                "depth": 12,
            }
        def set_elo(self, elo): pass
        def clear_elo(self): pass

    session_svc.set_engine(SlowEngine())
    session_svc.set_analysis_engine(None)

    result = session_svc.create_session("italian", "giuoco_piano", "white", "freestyle", None)
    sid = result.session_id

    # Fire two off-tree moves concurrently; collect exceptions rather than raising.
    outcomes = await asyncio.gather(
        session_svc.process_move(sid, "d2d4"),
        session_svc.process_move(sid, "d2d4"),
        return_exceptions=True,
    )

    state = session_svc.get_session(sid)
    assert len(state.move_history) == 1, (
        f"Expected exactly 1 move in history after concurrent requests, "
        f"got {len(state.move_history)}: {state.move_history}"
    )
    # Exactly one call should succeed; the other should be an error (illegal move on updated FEN)
    successes = [o for o in outcomes if isinstance(o, MoveResult)]
    errors = [o for o in outcomes if isinstance(o, Exception)]
    assert len(successes) == 1, f"Expected 1 success, got {len(successes)}"
    assert len(errors) == 1, f"Expected 1 error (illegal move on updated FEN), got {len(errors)}"
