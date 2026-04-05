import csv
import io as _io
from functools import lru_cache
from pathlib import Path

import chess
import chess.pgn

from app.models.opening import OpeningSummary, VariationSummary, VariationTree

_TSV_PATH = Path(__file__).parent.parent / "data" / "openings.tsv"


def _pgn_to_uci(pgn: str) -> list[str] | None:
    try:
        game = chess.pgn.read_game(_io.StringIO(pgn))
        if game is None:
            return None
        board = game.board()
        moves = []
        for move in game.mainline_moves():
            moves.append(move.uci())
            board.push(move)
        return moves or None
    except Exception:
        return None


def _build_trie(sequences: list[list[str]]) -> dict:
    root: dict = {}
    for seq in sequences:
        node = root
        for move in seq:
            node = node.setdefault(move, {})
    return root


@lru_cache(maxsize=None)
def _load() -> tuple[dict[str, dict], dict[tuple[str, str], dict]]:
    """
    Parse openings.tsv once.
    Returns:
      openings: { opening_id -> { id, name, color, variations: [VariationSummary] } }
      trees:    { (opening_id, variation_id) -> VariationTree dict }
    """
    rows = list(csv.DictReader(_TSV_PATH.open(encoding="utf-8"), delimiter="\t"))

    # Accumulate sequences per (opening_id, variation_id)
    openings: dict[str, dict] = {}
    variation_seqs: dict[tuple[str, str], list[list[str]]] = {}
    variation_meta: dict[tuple[str, str], dict] = {}

    for row in rows:
        oid = row["opening_id"]
        vid = row["variation_id"]
        key = (oid, vid)

        if oid not in openings:
            openings[oid] = {
                "id": oid,
                "name": row["opening_name"],
                "color": row["opening_color"],
                "variation_order": [],  # preserve insertion order
            }

        if key not in variation_meta:
            openings[oid]["variation_order"].append(vid)
            variation_meta[key] = {
                "id": vid,
                "opening_id": oid,
                "name": row["variation_name"],
                "color": row["opening_color"],
            }
            variation_seqs[key] = []

        uci = _pgn_to_uci(row["pgn"])
        if uci:
            variation_seqs[key].append(uci)

    trees: dict[tuple[str, str], dict] = {}
    for key, seqs in variation_seqs.items():
        unique = list({tuple(s): s for s in seqs}.values())
        meta = variation_meta[key]
        trees[key] = {**meta, "moves": _build_trie(unique)}

    return openings, trees


def list_openings() -> list[OpeningSummary]:
    openings, trees = _load()
    result = []
    for o in openings.values():
        variations = [
            VariationSummary(id=vid, name=trees[(o["id"], vid)]["name"])
            for vid in o["variation_order"]
            if (o["id"], vid) in trees
        ]
        result.append(OpeningSummary(
            id=o["id"],
            name=o["name"],
            color=o["color"],
            variations=variations,
        ))
    return result


def get_variation_tree(opening_id: str, variation_id: str) -> VariationTree | None:
    _, trees = _load()
    data = trees.get((opening_id, variation_id))
    if data is None:
        return None
    return VariationTree(**data)
