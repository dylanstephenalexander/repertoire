"""
Local opening detection built from openings.tsv.

For each row in the TSV, replays the PGN and records every intermediate
FEN → opening name.  When multiple lines pass through the same position the
most specific name *consistent with all of them* is used:

  - If every line is a Ruy López variant → show "Ruy López"
  - If every line is the Ruy López: Morphy Defense → show "Ruy López: Morphy Defense"
  - If lines span different openings (e.g. Italian + Ruy López) → return None

This prevents labelling a position with a variation before enough moves have
been played to confirm it.

No network calls — deterministic, fast, testable.
"""

import csv
import io
from functools import lru_cache
from pathlib import Path

import chess
import chess.pgn

_TSV_ALL = Path(__file__).parent.parent / "data" / "openings_all.tsv"
_TSV_FALLBACK = Path(__file__).parent.parent / "data" / "openings.tsv"


def _normalise_fen(fen: str) -> str:
    """Strip halfmove clock and fullmove number — irrelevant for opening identity."""
    parts = fen.split(" ")
    return " ".join(parts[:4]) if len(parts) >= 4 else fen


def _common_label(names: set[str]) -> str | None:
    """
    Return the most specific name consistent with every name in *names*.

    Names have the form "Opening" or "Opening: Variation".  Rules:
      - If the openings differ → None (ambiguous)
      - If the opening is the same but variations differ (or some lines have no
        variation) → return just the opening name
      - If every name agrees on opening AND variation → return the full name
    """
    if not names:
        return None

    openings: set[str] = set()
    variations: set[str | None] = set()
    for name in names:
        if ": " in name:
            opening, variation = name.split(": ", 1)
        else:
            opening, variation = name, None
        openings.add(opening)
        variations.add(variation)

    if len(openings) != 1:
        return None  # Spans multiple openings — too early to name

    common_opening = next(iter(openings))

    if len(variations) == 1 and None not in variations:
        return f"{common_opening}: {next(iter(variations))}"

    return common_opening


@lru_cache(maxsize=None)
def _build_lookup() -> dict[str, str]:
    """
    Parse the opening book once and return a {normalised_fen: label} mapping.

    Uses openings_all.tsv (full Lichess dataset, ~3700 rows) when available,
    falling back to openings.tsv (5-opening subset).  For each PGN every
    intermediate FEN is recorded.  Each FEN is labelled with the most specific
    name consistent with ALL lines that pass through it (see _common_label).
    """
    name_sets: dict[str, set[str]] = {}  # fen -> all variation names through it

    tsv = _TSV_ALL if _TSV_ALL.exists() else _TSV_FALLBACK
    rows = list(csv.DictReader(tsv.open(encoding="utf-8"), delimiter="\t"))

    for row in rows:
        pgn_text = row.get("pgn", "").strip()
        if not pgn_text:
            continue

        # openings_all.tsv has a single "name" column ("Opening: Variation")
        # openings.tsv has separate "opening_name" and "variation_name" columns
        if "name" in row:
            display_name = row["name"].strip()
        else:
            opening_name = row.get("opening_name", "").strip()
            variation_name = row.get("variation_name", "").strip()
            display_name = (
                f"{opening_name}: {variation_name}"
                if variation_name and variation_name != opening_name
                else opening_name
            )

        try:
            game = chess.pgn.read_game(io.StringIO(pgn_text))
            if game is None:
                continue
            board = game.board()
            for move in game.mainline_moves():
                board.push(move)
                fen = _normalise_fen(board.fen())
                name_sets.setdefault(fen, set()).add(display_name)
        except Exception:
            continue

    result: dict[str, str] = {}
    for fen, names in name_sets.items():
        label = _common_label(names)
        if label is not None:
            result[fen] = label
    return result


def detect_opening(fen: str) -> str | None:
    """
    Return the opening name for this position, or None if not in our book.
    """
    normalised = _normalise_fen(fen)
    return _build_lookup().get(normalised)
