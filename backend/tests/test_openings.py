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
