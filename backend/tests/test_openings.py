import chess
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.openings import get_variation_tree

client = TestClient(app)

EXPECTED_OPENINGS = {
    "italian": {"giuoco_piano", "giuoco_pianissimo", "two_knights", "evans_gambit"},
    "ruy_lopez": {"morphy", "berlin", "closed"},
    "queens_gambit": {"declined", "accepted", "semi_slav"},
    "sicilian": {"najdorf"},
    "french": {"winawer", "classical", "tarrasch", "advance"},
}


def test_list_openings_returns_all():
    resp = client.get("/openings")
    assert resp.status_code == 200
    data = resp.json()
    ids = {o["id"] for o in data}
    assert ids == set(EXPECTED_OPENINGS.keys())


def test_list_openings_includes_variations():
    resp = client.get("/openings")
    for opening in resp.json():
        variation_ids = {v["id"] for v in opening["variations"]}
        assert variation_ids == EXPECTED_OPENINGS[opening["id"]]


def test_get_tree_valid():
    resp = client.get("/openings/italian/variations/giuoco_piano/tree")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "giuoco_piano"
    assert data["opening_id"] == "italian"
    assert isinstance(data["moves"], dict)
    assert len(data["moves"]) > 0


def test_get_tree_not_found():
    resp = client.get("/openings/italian/variations/nonexistent/tree")
    assert resp.status_code == 404

    resp = client.get("/openings/nonexistent/variations/najdorf/tree")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Opening tree legality — validate every path with python-chess
# ---------------------------------------------------------------------------

def _walk_tree(node: dict, board: chess.Board, path: list[str]) -> list[str]:
    errors = []
    for uci_move, subtree in node.items():
        try:
            move = chess.Move.from_uci(uci_move)
        except ValueError:
            errors.append(f"Invalid UCI '{uci_move}' at path {path}")
            continue

        if move not in board.legal_moves:
            errors.append(
                f"Illegal move '{uci_move}' at path {path} (fen: {board.fen()})"
            )
            continue

        board.push(move)
        if subtree:
            errors.extend(_walk_tree(subtree, board, path + [uci_move]))
        board.pop()

    return errors


@pytest.mark.parametrize("opening_id,variation_id", [
    (oid, vid)
    for oid, vids in EXPECTED_OPENINGS.items()
    for vid in vids
])
def test_variation_tree_all_moves_legal(opening_id: str, variation_id: str):
    tree = get_variation_tree(opening_id, variation_id)
    assert tree is not None
    errors = _walk_tree(tree.moves, chess.Board(), [])
    assert errors == [], "\n".join(errors)


# ---------------------------------------------------------------------------
# Opening detection — local lookup
# ---------------------------------------------------------------------------

from app.services.opening_detect import detect_opening, _normalise_fen, _build_lookup


def test_detect_giuoco_piano():
    """Terminal position of the Giuoco Piano starting variation is recognised."""
    # 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5
    fen = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"
    assert detect_opening(fen) == "Italian Game: Giuoco Piano"


def test_detect_najdorf():
    """Najdorf position is recognised."""
    # 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6
    fen = "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6"
    assert detect_opening(fen) == "Sicilian Defense: Najdorf Variation"


def test_intermediate_position_returns_none():
    """After 1.e4 alone (not a terminal position in any line) — no name."""
    fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    assert detect_opening(fen) is None


def test_starting_position_returns_none():
    assert detect_opening("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") is None


def test_normalise_fen_strips_clocks():
    fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    assert _normalise_fen(fen) == "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -"


def test_normalise_fen_handles_short_fen():
    short = "8/8/8/8/8/8/8/8 w"
    assert _normalise_fen(short) == short


def test_build_lookup_is_populated():
    lookup = _build_lookup()
    assert len(lookup) > 100


def test_detect_opening_clock_independent():
    """Same position with different clock values should map to the same name."""
    # Two FENs that differ only in halfmove/fullmove clocks
    fen_a = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"
    fen_b = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 10 99"
    assert detect_opening(fen_a) == detect_opening(fen_b)
