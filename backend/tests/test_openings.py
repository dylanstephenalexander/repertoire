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

from app.services.opening_detect import detect_opening, _normalise_fen, _build_lookup, _common_label


def _play(*ucis: str) -> str:
    """Return the FEN reached after playing the given UCI moves from the start."""
    board = chess.Board()
    for uci in ucis:
        board.push(chess.Move.from_uci(uci))
    return board.fen()


# -- _common_label unit tests ------------------------------------------------

def test_common_label_single_full_name():
    assert _common_label({"Italian Game: Giuoco Piano"}) == "Italian Game: Giuoco Piano"

def test_common_label_same_opening_different_variations():
    names = {"Ruy Lopez: Morphy Defense", "Ruy Lopez: Berlin Defense", "Ruy Lopez: Closed"}
    assert _common_label(names) == "Ruy Lopez"

def test_common_label_different_openings():
    names = {"Italian Game: Giuoco Piano", "Ruy Lopez: Morphy Defense"}
    assert _common_label(names) is None

def test_common_label_opening_without_variation_mixed():
    # A name without ": " mixed with one that has it → only opening is common
    names = {"Sicilian Defense", "Sicilian Defense: Najdorf Variation"}
    assert _common_label(names) == "Sicilian Defense"

def test_common_label_empty():
    assert _common_label(set()) is None


# -- Lookup coverage ---------------------------------------------------------

def test_build_lookup_covers_full_dataset():
    """With openings_all.tsv the lookup should be well above the 5-opening subset."""
    assert len(_build_lookup()) > 5000


# -- Original 5 openings -----------------------------------------------------

def test_detect_italian():
    name = detect_opening(_play("e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "c2c3"))
    assert name is not None and "Italian" in name

def test_detect_sicilian():
    name = detect_opening(_play("e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"))
    assert name is not None and "Sicilian" in name

def test_detect_ruy_lopez():
    name = detect_opening(_play("e2e4", "e7e5", "g1f3", "b8c6", "f1b5"))
    assert name is not None and "Ruy Lopez" in name

def test_detect_queens_gambit():
    # 1.d4 d5 2.c4 dxc4 — unambiguously Queen's Gambit Accepted
    name = detect_opening(_play("d2d4", "d7d5", "c2c4", "d5c4"))
    assert name is not None and "Queen" in name

def test_detect_french():
    name = detect_opening(_play("e2e4", "e7e6", "d2d4", "d7d5"))
    assert name is not None and "French" in name


# -- Openings outside the original 5 ----------------------------------------

def test_detect_caro_kann():
    name = detect_opening(_play("e2e4", "c7c6", "d2d4", "d7d5"))
    assert name is not None and "Caro-Kann" in name

def test_detect_scotch():
    # Need 3...exd4 4.Nxd4 to disambiguate from Italian transpositions
    name = detect_opening(_play("e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4", "f3d4"))
    assert name is not None and "Scotch" in name

def test_detect_london():
    # 1.d4 Nf6 2.Bf4 — Indian Defense: Accelerated London System
    name = detect_opening(_play("d2d4", "g8f6", "c1f4"))
    assert name is not None and "London" in name

def test_detect_nimzo_indian():
    name = detect_opening(_play("d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4"))
    assert name is not None and "Nimzo" in name

def test_detect_kings_gambit():
    # 1.e4 e5 2.f4 exf4 3.Bc4 — King's Gambit Accepted
    name = detect_opening(_play("e2e4", "e7e5", "f2f4", "e5f4", "f1c4"))
    assert name is not None and "King" in name


# -- Label-narrowing progression ---------------------------------------------

def test_label_narrows_as_moves_progress():
    """Each new label should be a refinement of the previous, never a jump to a different opening."""
    moves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"]  # Ruy Lopez: Morphy
    board = chess.Board()
    prev_label: str | None = None
    for uci in moves:
        board.push(chess.Move.from_uci(uci))
        label = detect_opening(board.fen())
        if label is not None and prev_label is not None:
            assert prev_label in label or label in prev_label, (
                f"Label jumped from '{prev_label}' to '{label}'"
            )
        if label is not None:
            prev_label = label


# -- Edge cases --------------------------------------------------------------

def test_starting_position_returns_none():
    assert detect_opening(_play()) is None

def test_ambiguous_after_e4_returns_none():
    assert detect_opening(_play("e2e4")) is None

def test_out_of_book_returns_none():
    # 1.a4 a5 2.h4 h5 — not in any opening book
    assert detect_opening(_play("a2a4", "a7a5", "h2h4", "h7h5")) is None

def test_normalise_fen_strips_clocks():
    fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    assert _normalise_fen(fen) == "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -"

def test_normalise_fen_handles_short_fen():
    assert _normalise_fen("8/8/8/8/8/8/8/8 w") == "8/8/8/8/8/8/8/8 w"

def test_detect_opening_clock_independent():
    """Same position with different clock values must map to the same name."""
    fen_a = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"
    fen_b = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 10 99"
    assert detect_opening(fen_a) == detect_opening(fen_b)
