# Repertoire

![video demo](https://github.com/user-attachments/assets/5620b530-3bac-40fe-be61-5dc7fae9577c)


A free, self-hosted chess training tool. No subscriptions, no paywalls, no depth limits — everything runs locally using your own engine.

## What it does

**Opening Drills** — pick a color and opening, then drill the theory move by move. Stockfish evaluates every deviation and explains it in plain English (or engine output, depending on your skill level). Accuracy is tracked per session.

**Chaos Mode** — play against [Maia Chess](https://maiachess.com/), a neural network trained on millions of human games at specific Elo bands (1100–1900). Maia makes the mistakes a human at that level actually makes — not random blunders, but the real pattern of errors at each rating. Select 2000+ to play full-strength Stockfish instead.

**Game Review** — import your games from chess.com or lichess by username, then run them through your local Stockfish for unlimited-depth move-by-move analysis. Identifies blunders, mistakes, and inaccuracies, and suggests better lines. No premium account required.

## Stack

- **Frontend**: React + TypeScript (`react-chessboard`, `chess.js`)
- **Backend**: FastAPI (Python)
- **Engine**: Stockfish v18 (UCI subprocess, long-lived)
- **Opponent**: lc0 + Maia weights (UCI, one node per move)

## Requirements

- [Stockfish](https://stockfishchess.org/download/) — `brew install stockfish` on macOS
- [lc0](https://lczero.org/) — required for Chaos Mode below Elo 2000. `brew install lc0` on macOS. Maia weight files (`maia-{elo}.pb.gz`) go in `backend/app/data/maia/` — download from [github.com/CSSLab/maia-chess](https://github.com/CSSLab/maia-chess)
- Python 3.11+, Node 18+

## Setup

```bash
# Backend
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload
```

If lc0 isn't on your PATH, create `backend/.env`:
```
LC0_PATH=/path/to/lc0
```

```bash
# Frontend
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## Running tests

```bash
# Backend (engine tests require Stockfish)
cd backend
STOCKFISH_PATH=$(which stockfish) .venv/bin/python -m pytest tests/

# Frontend
cd frontend
npm test
```
