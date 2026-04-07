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

**Pre-Analysis Engine Optimisation (feedback latency)**

Currently `process_move` runs two serial Stockfish calls for off-tree moves: `pre_eval` (top-N lines from the position before the user moves) then `post_eval` (eval of the position after). Both block the response. Applies to Study Mode, Chaos Mode, and Maia play.

**Core insight:** `pre_eval` with multipv=N already contains the cp value for any move the user plays that falls within the top N. `cp_loss = pre_cp - user_move_cp` (both from the same perspective — no second engine call needed). `post_eval` is only required when the user plays a move outside the top N (a genuine blunder Stockfish didn't rank).

**Design:**
- Add a second `StockfishEngine` instance (`_analysis_engine`) at startup alongside the existing `_engine` (used for opponent moves).
- After `opponent_move` resolves, immediately start background pre_eval on `_analysis_engine` at higher multipv (start with 10; tune empirically — higher covers more user moves but slows the search). Store result + the FEN it was computed for on the session.
- On `process_move` (off-tree path):
  1. If cached pre_eval exists and FEN matches and user's move is in the lines → use cached cp, skip all engine calls.
  2. If cached pre_eval exists but user's move is not in lines → fire post_eval on `_engine` (the main engine), wait for it only.
  3. If pre_eval not yet done → fire post_eval on `_engine` in parallel, await both.
- Clear the cache on every `process_move` regardless of outcome.
- Best case (user took time to think, played a top-N move): zero engine calls at response time.
- Worst case (user moved instantly or played a deep blunder): max(remaining pre_eval, post_eval) — never worse than current serial behaviour.

**Open question at implementation time:** benchmark multipv values (5 / 10 / 15 / 20) against analysis speed in opening positions to pick the default.

## Post-MVP Ideas
- **Game Review**: fetch past games from chess.com public API (`api.chess.com/pub/player/{username}/games/{year}/{month}`, no auth needed for public games), run move-by-move through local Stockfish, annotate blunders/mistakes/inaccuracies with "better was X" suggestions. Bypasses chess.com's depth-limited premium review using the user's own engine. Infrastructure (Stockfish, board rendering) is already in place — the work is the annotation UI.
- **Chaos Mode**: opponent scales to user's current Elo (UCI_LimitStrength + UCI_Elo). Two-request pattern — user move then separate `opponent_move` so frontend controls animation timing. Suggest Elo adjustment after session based on performance. Note: `UCI_LimitStrength` has a floor of ~1320 Elo and doesn't simulate human-like mistakes well at lower ratings — consider **Maia Chess** for sub-1600 play. Maia is a neural net trained on millions of human games at specific Elo bands (1100–1900), predicts the move a human at that level would actually play (blunders included), and is UCI-compatible (drop-in replacement for the opponent engine at low Elos). See: [lczero.org/play/infrastructure/maia/](https://lczero.org/play/infrastructure/maia/).
- **Promotion Picker UI**: currently `resolveMove` in `Board.tsx` always promotes to queen (hardcoded). A real picker should appear when a pawn reaches the back rank — show the four piece options (Q/R/B/N), let the user click one, then send the 5-char UCI. `react-chessboard` has a built-in `promotionDialogVariant` option; alternatively render a custom overlay. The seam is already clean: `useSession.move()` already handles 5-char UCI strings.
- **LLM Move Explanations**: replace hardcoded feedback templates in `backend/app/services/feedback.py` with Claude API calls. The `build_*_feedback` functions are the right seam — add `pre_move_fen: str` param and swap templates for a prompt. Needs `ANTHROPIC_API_KEY` env var; template strings stay as fallback when key is absent. Prompt shape: "In this position [FEN], the player moved [played_san] instead of [best_san] (-[cp_loss]cp). Explain in one sentence for a [skill_level] player." Would produce "You shouldn't move your knight there because the Queen can take it" style explanations naturally.
- **Desktop App (Electron/Tauri)**: bundle as a native desktop app so Stockfish, lc0, and Maia weights ship inside the package — no user install steps. Two viable options: **Electron** (Chromium + Node, larger bundle ~150MB but mature, easiest FastAPI sidecar story), **Tauri** (Rust shell + system WebView, ~10MB, faster startup, slightly more work for Python sidecar). FastAPI runs as a child process spawned by the shell on app launch; stdout/stderr piped for crash recovery. Stockfish + lc0 binaries go in `resources/` and are extracted to app data dir on first launch. Auto-update via Electron's built-in updater or Tauri updater plugin. Key remaining work: code-sign (macOS notarization required for Gatekeeper), platform-specific binary bundles (macOS arm64/x86_64 universal, Windows x64, Linux AppImage), Python bundling via PyInstaller or cx_Freeze to produce a single FastAPI executable (removes Python runtime dependency — preferred for distribution).
- **Settings Panel**: eval bar toggle, feedback toggle, skill level selector — currently scattered. Consolidate into a `Settings/` slide-in panel (gear icon in sidebar). Designed for extensibility: each setting is a row, easy to add new ones. **Notation mode** (AN / English / Both) is currently hardcoded to "readable" (`App.tsx` — `const notationMode: NotationMode = "readable"`); the `translateExplanation` utility and `NotationMode` type are fully implemented, just needs a settings toggle to expose it.
- **Sub-1100 Opponents**: Maia's floor is 1100. For lower Elos: (1) clamp to Maia-1100 with a UI note, (2) Stockfish `UCI_LimitStrength` (unrealistic, misses tactics randomly not human-like), (3) community Maia-extending weights covering 800–1000 when available. Revisit when bundling for distribution.
- **Sound Effects**: Add sound effects for moves. Experiment with differentiating sounds for castling, checkmate, check, etc.
- **View Previous Moves**: Should be able to iterate through previous moves within a game. Back to Start, Back to Current, Back One Move, Up One Move. Cannot replay the gamestate from this point, but can view moves. -> Should moves be stored along with the eval? So that stockfish doesnt need to recalculate?
- **Board UX — Drag Precision**: `react-chessboard` drag sensitivity is too tight — requires pixel-perfect placement, causing pieces to snap back if dropped slightly off-square. Also, rapid moves when it's the user's turn can fail silently (move rejected, piece snaps back with no feedback). Investigate `react-chessboard` drop tolerance options; add a visible "illegal move" flash or shake animation so the user knows why a move was rejected rather than wondering if it registered.
- **LLM Explanation Latency**: Gemini is called synchronously inside `process_move`, blocking the entire move response for 5–10s on the free tier. Fix: return `process_move` immediately with the template explanation, fire the LLM as a background `asyncio.create_task`, store the result in a `_pending_explanations` dict keyed by session. Add `GET /session/{id}/explanation` — returns LLM text when ready or `null` if still pending. Frontend polls once after receiving the move response (with a timeout), updates the feedback panel when the explanation arrives. Board re-enables immediately; explanation fades in when ready.
- **Improve LLM Prompt**: prompt needs to be improved. right now it's doing far too much guesswork. generate taglines to feed it, to remove inference work, and just have it act as a translator.

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