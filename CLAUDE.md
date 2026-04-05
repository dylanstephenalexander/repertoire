# CLAUDE.md

## Response Style
- Plans: maximally concise, grammar optional. End with unresolved questions.
- Code: quality > speed. Never proceed to implementation without a passing design review.

## Review Style
- No filler praise ("Great idea!", "That's a smart approach").
- If something is wrong or suboptimal, say so directly and first.
- Critique code and decisions as if shipping quality is the only metric.

## Project
Chess openings trainer (React/TS + FastAPI + Stockfish). Target user: all skill levels (~200–2000+ Elo).

## Stack
- Backend: FastAPI (Python)
- Frontend: React (TypeScript)
- Engine: Stockfish v18 (eval + move analysis, multipv)
- Testing: pytest (backend), React Testing Library (frontend)
- Linting: Ruff

## Dev setup
```bash
# Backend
brew install stockfish
export STOCKFISH_PATH=$(which stockfish)
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
cd frontend && npm test                    # vitest (jsdom)
```

Tests requiring a real engine are gated on `STOCKFISH_PATH`:
```bash
STOCKFISH_PATH=$(which stockfish) python -m pytest tests/
```

## Workflow (mandatory)
For every feature:
1. Propose: folder structure, data models, API contract, and open questions.
2. Wait for explicit approval.
3. Implement exactly what was approved — nothing more.
4. Write tests before marking complete.
5. Tests must pass before moving to the next feature.

## Code Standards
- Modular, clean architecture. Easy to refactor.
- No unnecessary dependencies.
- No vibe coding. If something feels hacky, flag it.

## Move Explanations (critical UX rule)
Explanations must match the user's skill level.
- Beginner: plain English, no jargon. BAD: "You lost tempo" GOOD: "This move lets your opponent attack your queen for free"
- Advanced: engine output (centipawn loss, depth, lines) is appropriate

## Elo & Difficulty
- Study Mode: Elo-agnostic. Always drills theoretically correct moves.
- Elo is adjustable any time (settings, not buried in menus) — relevant when Chaos Mode is implemented.

## MVP Features (in order)
1. Study Mode (color + opening selection, accuracy score)
2. Move Feedback System (Stockfish-powered, beginner-friendly)
3. Evaluation Bar

## Post-MVP Ideas
- **Game Review**: fetch past games from chess.com public API (`api.chess.com/pub/player/{username}/games/{year}/{month}`, no auth needed for public games), run move-by-move through local Stockfish, annotate blunders/mistakes/inaccuracies with "better was X" suggestions. Bypasses chess.com's depth-limited premium review using the user's own engine. Infrastructure (Stockfish, board rendering) is already in place — the work is the annotation UI.
- **Chaos Mode**: opponent scales to user's current Elo (UCI_LimitStrength + UCI_Elo). Two-request pattern — user move then separate `opponent_move` so frontend controls animation timing. Suggest Elo adjustment after session based on performance.

## Architecture

```
Browser (React/TS) ↔ FastAPI (Python) ↔ Stockfish (UCI subprocess)
```

Stockfish runs as a long-lived child process (stdin/stdout UCI). Single instance for MVP, pooled later if needed.

## Folder Structure

```
repertoire/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── openings.py
│   │   │   ├── analysis.py
│   │   │   └── session.py
│   │   ├── engine/
│   │   │   ├── stockfish.py     # UCI wrapper
│   │   │   └── eval.py
│   │   ├── models/
│   │   │   ├── opening.py
│   │   │   ├── session.py
│   │   │   └── feedback.py
│   │   ├── services/
│   │   │   ├── openings.py
│   │   │   ├── feedback.py      # skill-aware explanations
│   │   │   └── difficulty.py
│   │   └── data/
│   │       └── openings.tsv     # source of truth for opening theory (committed)
│   └── tests/
└── frontend/
    └── src/
        ├── components/
        │   ├── Board/
        │   ├── EvalBar/
        │   ├── Feedback/
        │   ├── OpeningSelector/
        │   └── Settings/
        ├── hooks/
        ├── api/
        └── types/
```

## API Contract (approved)

```
GET  /openings                                          → [{ id, name, color, variations: [{id, name}] }]
GET  /openings/{opening_id}/variations/{variation_id}/tree → move tree

POST /session/start                   → { opening_id, variation_id, color, mode, elo?, skill_level }
                                      ← { session_id, fen, to_move }
POST /session/{id}/move               → { uci_move }
                                      ← { result, feedback, eval_cp?, best_move?, fen }
POST /session/{id}/opponent_move      ← { uci_move, fen }
GET  /session/{id}/state              → { fen, score, move_history, mode, ... }

POST /analysis/eval                   → { fen }
                                      ← { lines: [{move_uci, move_san, cp}], eval_cp, depth }
```

## Data Models (approved)

**Opening hierarchy**
- `Opening { id, name, color, variations: [VariationSummary] }`
- `VariationTree { id, opening_id, name, color, moves: dict }`

**Session (in-memory)**
```python
id, opening_id, variation_id, color, mode, elo, skill_level,
current_fen, move_history, score, tree_cursor
```

**Feedback**
```python
quality: "correct" | "alternative" | "mistake" | "blunder"
explanation: str                   # skill-level-appropriate
centipawn_loss: int | None
lines: list[AnalysisLine] | None   # top N engine candidates (pre-move position)
```

**AnalysisLine**
```python
move_uci: str   # e.g. "e2e4"
move_san: str   # e.g. "e4"
cp: int         # centipawns for side to move
```

**Opening data**
- Source: `backend/app/data/openings.tsv` — committed, columns: `opening_id, opening_name, opening_color, variation_id, variation_name, eco, pgn`
- Parsed with python-chess at startup; UCI tries built in memory and `lru_cache`d
- To refresh from upstream lichess: `python scripts/fetch_openings.py` (requires network)
- JSON files are generated artifacts — gitignored, do not commit

## Key Design Decisions (approved)

- **Sessions**: in-memory. Elo persisted in `localStorage` on frontend only.
- **Stockfish**: bundled binary (macOS), path configurable via env var for other platforms.
- **Board**: `react-chessboard` + `chess.js`. Note: react-chessboard v3 uses `<Chessboard options={{...}} />` — all props are inside the `options` object, not flat props.
- **Skill level + Elo**: stored in session, decoupled. `elo` controls engine strength; `skill_level` controls explanation style. Optional per-request override for skill_level.
- **Move feedback logic**:
  - In-tree → "correct"
  - Off-tree, cp_loss ≤ 25 → "mainline was X, but yours is fine too"
  - Off-tree, cp_loss > 25 → mistake/blunder + explanation
  - Threshold (25cp) is tunable at implementation time
- **MVP openings**: Italian Game, Sicilian Najdorf, Queen's Gambit, Ruy López, French Defence
- **Frontend styling**: plain CSS modules (`.module.css` per component). No inline styles. No CSS framework.
- **Opponent move UX**: after a correct user move, show "Thinking..." for ~1s, then POST `/opponent_move` and animate the response. Simulates game feel.
- **Opening selector**: modal overlay on app start; dismissed once a session begins.