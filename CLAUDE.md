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

## Next to Implement

**QoL Pass**

1. **Board UX — Drag Precision**: `react-chessboard` this is at a pretty good stage, but i would like to fine-tune the movement to perfection. I want movements to be snappy, fluid, satisfying. Maybe Material-3 might be worth looking into: https://m3.material.io/blog/m3-expressive-motion-theming 

2. **Sound Effects**: Swap out the boilerplate white noise sounds with curated sounds. Have sound themes that are selectable in settings.

3. **Customization**: use https://coolors.co to generate a few themes and test those out. Do the same with board, pieces. Give a more human and artistic feel.

## UX Vision — Making It Feel Alive

Priority order. These are the highest-impact changes for making the app feel like a chess experience, not a tool.

1. **Sound**: Curate a satisfying piece clack, a sharper sound for captures, a low thud for check. Sound creates most of the physical feeling. A quiet room with a sharp piece landing is tension.

2. **Pacing / Stagger**: Stop showing everything simultaneously. Feedback fades in 200ms after the move lands. A beat passes between the move landing and the eval bar moving. Score ticks up with a slight delay. Silence before information creates weight.

3. **Screen Transitions**: Opening selector to board is a hard DOM swap. Use crossfades or subtle slides for continuity. Game-over modal: board dims slowly behind the overlay, not an instant rgba snap.

4. **Board Physicality**: Dragged piece gets a subtle drop shadow that grows on lift. Brief scale pulse on landing (1.0 to 1.05 to 1.0, 150ms). Legal move indicators fade in, not pop.

5. **Move List as Narrative**: New moves slide into the list. Current move gets a subtle glow or left-border accent. Mistakes visually interrupt — red flash on entry, not just a colored dot.

6. **Eval Bar Drama**: Big eval swings (>200cp) trigger a brief pulse or edge glow. Quiet games have a bar that barely moves. Volatile positions should feel volatile.

7. **Typography / Negative Space**: Score and eval should feel like a scoreboard, not a label. Opening name gets real presence. More vertical spacing in sidebar — density feels like a tool, space feels like an experience.

8. **Color Temperature**: Subtle warm tint on the board area background (#1a1816 instead of #1e1e1e) for subconscious warmth/wood. Keep sidebar cool. Warm board + cool controls = visual hierarchy.

## Future Ideas

- **Promotion Picker UI**: currently `resolveMove` in `Board.tsx` always promotes to queen (hardcoded). A real picker should appear when a pawn reaches the back rank — show the four piece options (Q/R/B/N), let the user click one, then send the 5-char UCI. `react-chessboard` has a built-in `promotionDialogVariant` option; alternatively render a custom overlay. The seam is already clean: `useSession.move()` already handles 5-char UCI strings.

- **Settings Panel**: eval bar toggle, feedback toggle, skill level selector — currently scattered. Consolidate into a `Settings/` slide-in panel (gear icon in sidebar). Designed for extensibility: each setting is a row, easy to add new ones. **Notation mode** (AN / English / Both) is currently hardcoded to "readable" (`App.tsx` — `const notationMode: NotationMode = "readable"`); the `translateExplanation` utility and `NotationMode` type are fully implemented, just needs a settings toggle to expose it.

- **Sub-1100 Opponents**: Maia's floor is 1100. For lower Elos: (1) clamp to Maia-1100 with a UI note, (2) Stockfish `UCI_LimitStrength` (unrealistic, misses tactics randomly not human-like), (3) community Maia-extending weights covering 800–1000 when available. Revisit when bundling for distribution.

- **Deterministic Move Explanations**: LLM hallucinations make Gemini unreliable as the primary explanation source. Better approach: derive verifiable facts from python-chess (`_derive_tactical_facts` in `sessions.py` is already the skeleton — detects hanging pieces and opponent captures), format them directly into the explanation string. Cases to cover: (1) moved piece now hanging — done; (2) opponent's best reply captures a piece — done; (3) piece the moved piece was defending is now undefended (discovered weakness — `board.attackers()` before vs after); (4) moved piece is pinned against the king. Anything not matched falls back to a clean template. LLM stays as optional polish layer but should not be the primary path.

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