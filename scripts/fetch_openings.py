"""
Fetch the lichess-org/chess-openings dataset (CC0) and write a trimmed TSV
to backend/app/data/openings.tsv.

Run this whenever you want to refresh opening theory from upstream:

    python scripts/fetch_openings.py

The output TSV is the source of truth for opening data at runtime. It is
committed to the repo so no network access is required to run the server.
Columns: opening_id, opening_name, opening_color, variation_id, variation_name, eco, pgn
"""

import csv
import io
import urllib.request
from pathlib import Path

OUT_PATH = Path(__file__).parent.parent / "backend" / "app" / "data" / "openings.tsv"
OUT_ALL_PATH = Path(__file__).parent.parent / "backend" / "app" / "data" / "openings_all.tsv"

# Each opening lists the variations we ship. `prefix` controls which lichess
# rows are included (matched against the lichess `name` column).
OPENING_CONFIGS = [
    {
        "id": "italian",
        "name": "Italian Game",
        "color": "white",
        "variations": [
            {"id": "giuoco_piano",      "name": "Giuoco Piano",          "prefix": "Italian Game: Giuoco Piano"},
            {"id": "giuoco_pianissimo", "name": "Giuoco Pianissimo",      "prefix": "Italian Game: Giuoco Pianissimo"},
            {"id": "two_knights",       "name": "Two Knights Defense",    "prefix": "Italian Game: Two Knights Defense"},
            {"id": "evans_gambit",      "name": "Evans Gambit",           "prefix": "Italian Game: Evans Gambit"},
        ],
    },
    {
        "id": "ruy_lopez",
        "name": "Ruy López",
        "color": "white",
        "variations": [
            {"id": "morphy",   "name": "Morphy Defense", "prefix": "Ruy Lopez: Morphy Defense"},
            {"id": "berlin",   "name": "Berlin Defense", "prefix": "Ruy Lopez: Berlin Defense"},
            {"id": "closed",   "name": "Closed",         "prefix": "Ruy Lopez: Closed"},
        ],
    },
    {
        "id": "queens_gambit",
        "name": "Queen's Gambit",
        "color": "white",
        "variations": [
            {"id": "declined",   "name": "Queen's Gambit Declined", "prefix": "Queen's Gambit Declined"},
            {"id": "accepted",   "name": "Queen's Gambit Accepted", "prefix": "Queen's Gambit Accepted"},
            {"id": "semi_slav",  "name": "Semi-Slav Defense",       "prefix": "Queen's Gambit Declined: Semi-Slav"},
        ],
    },
    {
        "id": "sicilian",
        "name": "Sicilian Defense",
        "color": "black",
        "variations": [
            {"id": "najdorf", "name": "Najdorf Variation", "prefix": "Sicilian Defense: Najdorf Variation"},
        ],
    },
    {
        "id": "french",
        "name": "French Defense",
        "color": "black",
        "variations": [
            {"id": "winawer",   "name": "Winawer Variation",   "prefix": "French Defense: Winawer Variation"},
            {"id": "classical", "name": "Classical Variation", "prefix": "French Defense: Classical Variation"},
            {"id": "tarrasch",  "name": "Tarrasch Variation",  "prefix": "French Defense: Tarrasch Variation"},
            {"id": "advance",   "name": "Advance Variation",   "prefix": "French Defense: Advance Variation"},
        ],
    },
]

BASE_URL = "https://raw.githubusercontent.com/lichess-org/chess-openings/master"


def fetch_all_rows() -> list[dict]:
    rows: list[dict] = []
    for letter in "abcde":
        url = f"{BASE_URL}/{letter}.tsv"
        print(f"Fetching {url} ...")
        with urllib.request.urlopen(url, timeout=15) as resp:
            content = resp.read().decode("utf-8")
        reader = csv.DictReader(io.StringIO(content), delimiter="\t")
        rows.extend(reader)
    print(f"Fetched {len(rows)} total lines.\n")
    return rows


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    all_rows = fetch_all_rows()
    lichess_by_name: dict[str, list[dict]] = {}
    for row in all_rows:
        lichess_by_name.setdefault(row["name"], []).append(row)

    out_rows: list[dict] = []
    for opening in OPENING_CONFIGS:
        for variation in opening["variations"]:
            matched = [
                r for name, rows in lichess_by_name.items()
                if name.startswith(variation["prefix"])
                for r in rows
                if r.get("pgn", "").strip()
            ]
            if not matched:
                print(f"  WARNING: no rows for '{variation['prefix']}'")
                continue
            for row in matched:
                out_rows.append({
                    "opening_id":    opening["id"],
                    "opening_name":  opening["name"],
                    "opening_color": opening["color"],
                    "variation_id":  variation["id"],
                    "variation_name": variation["name"],
                    "eco":           row["eco"],
                    "pgn":           row["pgn"].strip(),
                })
            print(f"  {opening['id']}/{variation['id']}: {len(matched)} lines")

    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["opening_id", "opening_name", "opening_color",
                        "variation_id", "variation_name", "eco", "pgn"],
            delimiter="\t",
        )
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"\nWrote {len(out_rows)} rows → {OUT_PATH}")

    # Write the full Lichess dataset for opening detection (covers all openings).
    with OUT_ALL_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["eco", "name", "pgn"], delimiter="\t")
        writer.writeheader()
        writer.writerows({"eco": r["eco"], "name": r["name"], "pgn": r["pgn"]} for r in all_rows)

    print(f"Wrote {len(all_rows)} rows → {OUT_ALL_PATH}")


if __name__ == "__main__":
    main()
