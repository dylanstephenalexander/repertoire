"""
Game review service.

Fetches games from chess.com / lichess public APIs and annotates each move
using Stockfish (cp loss classification + skill-level-aware explanations).
"""

import hashlib
import io
from typing import Literal

import chess
import chess.pgn
import httpx

from app.engine.stockfish import StockfishEngine
from app.models.review import GameSummary, MoveAnnotation, ReviewResponse

REVIEW_DEPTH = 15  # separate constant so it can be tuned independently of study mode

# In-memory cache: (pgn_hash, skill_level) → ReviewResponse
_analysis_cache: dict[tuple[str, str], ReviewResponse] = {}


def _cache_key(pgn: str, skill_level: str) -> tuple[str, str]:
    return (hashlib.md5(pgn.encode()).hexdigest(), skill_level)


def clear_analysis_cache() -> None:
    """Clear the analysis cache. For testing only."""
    _analysis_cache.clear()

# Thresholds (cp loss, side-to-move perspective)
_GOOD_THRESHOLD = 10
_INACCURACY_THRESHOLD = 25
_MISTAKE_THRESHOLD = 150


def _classify(cp_loss: int) -> Literal["best", "good", "inaccuracy", "mistake", "blunder"]:
    if cp_loss <= 0:
        return "best"
    if cp_loss <= _GOOD_THRESHOLD:
        return "good"
    if cp_loss <= _INACCURACY_THRESHOLD:
        return "inaccuracy"
    if cp_loss <= _MISTAKE_THRESHOLD:
        return "mistake"
    return "blunder"


def _explain(
    quality: str,
    played_san: str,
    best_san: str | None,
    cp_loss: int,
    skill_level: str,
) -> str | None:
    """Return a skill-level-aware explanation for annotated moves.

    Returns None for 'best' and 'good' — no comment needed.
    """
    if quality in ("best", "good"):
        return None

    alt = best_san or "the engine's suggestion"

    if skill_level == "beginner":
        if quality == "inaccuracy":
            return f"{played_san} is a slight inaccuracy. {alt} was a bit better."
        if quality == "mistake":
            return f"{played_san} gives your opponent an advantage. Try {alt} instead."
        return f"Oops — {played_san} is a big mistake. {alt} was the right move here."

    if skill_level == "advanced":
        if quality == "inaccuracy":
            return f"Inaccuracy: {played_san} (-{cp_loss} cp). Better: {alt}."
        if quality == "mistake":
            return f"Mistake: {played_san} (-{cp_loss} cp). Best: {alt}."
        return f"Blunder: {played_san} (-{cp_loss} cp). Best: {alt}."

    # intermediate (default)
    if quality == "inaccuracy":
        return f"{played_san} is slightly inaccurate (-{cp_loss} cp). {alt} was better."
    if quality == "mistake":
        return f"{played_san} is a mistake (-{cp_loss} cp). Best was {alt}."
    return f"{played_san} is a blunder (-{cp_loss} cp). Best was {alt}."


def _pgn_header(game: chess.pgn.Game, key: str, default: str = "?") -> str:
    return game.headers.get(key, default)


def analyse_game(pgn_str: str, skill_level: str, engine: StockfishEngine) -> ReviewResponse:
    key = _cache_key(pgn_str, skill_level)
    if key in _analysis_cache:
        return _analysis_cache[key]

    """Walk every move in the game and annotate with Stockfish."""
    game = chess.pgn.read_game(io.StringIO(pgn_str))
    if game is None:
        raise ValueError("Could not parse PGN")

    white = _pgn_header(game, "White")
    black = _pgn_header(game, "Black")
    result = _pgn_header(game, "Result")

    board = game.board()
    annotations: list[MoveAnnotation] = []

    for node in game.mainline():
        move = node.move
        fen_before = board.fen()
        color: Literal["white", "black"] = "white" if board.turn == chess.WHITE else "black"
        move_number = board.fullmove_number
        played_san = board.san(move)
        played_uci = move.uci()

        # Analyse pre-move position (multipv=1 — only need best move for comparison)
        pre = engine.analyse(fen_before, multipv=1, depth=REVIEW_DEPTH)
        pre_cp: int = pre.get("eval_cp") or 0
        best_move_uci: str | None = pre.get("best_move")

        best_move_san: str | None = None
        if best_move_uci:
            try:
                best_move_san = board.san(chess.Move.from_uci(best_move_uci))
            except Exception:
                best_move_san = best_move_uci

        # Make the move, analyse post-move position
        board.push(move)
        post = engine.analyse(board.fen(), multipv=1, depth=REVIEW_DEPTH)
        post_cp: int = post.get("eval_cp") or 0

        # cp_loss: how much worse the played move is vs best, from the playing side's perspective
        cp_loss = max(0, pre_cp + post_cp)

        # eval from white's perspective (for the eval bar)
        if color == "white":
            eval_cp_white = -post_cp
        else:
            eval_cp_white = post_cp

        quality = _classify(cp_loss)
        # Only include best_move_san in annotation when there's something to comment on
        annotated_best = best_move_san if quality not in ("best", "good") else None
        explanation = _explain(quality, played_san, annotated_best, cp_loss, skill_level)

        annotations.append(
            MoveAnnotation(
                move_number=move_number,
                color=color,
                move_san=played_san,
                move_uci=played_uci,
                quality=quality,
                cp_loss=cp_loss if quality not in ("best", "good") else None,
                best_move_san=annotated_best,
                explanation=explanation,
                fen_before=fen_before,
                eval_cp=eval_cp_white,
            )
        )

    response = ReviewResponse(white=white, black=black, result=result, moves=annotations)
    _analysis_cache[key] = response
    return response


async def fetch_chess_com_games(username: str, year: int, month: int) -> list[GameSummary]:
    """Fetch games from chess.com public archive API."""
    url = f"https://api.chess.com/pub/player/{username.lower()}/games/{year}/{month:02d}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, headers={"User-Agent": "Repertoire/1.0"})
        resp.raise_for_status()

    data = resp.json()
    summaries: list[GameSummary] = []
    for g in data.get("games", []):
        white_info = g.get("white", {})
        black_info = g.get("black", {})
        summaries.append(
            GameSummary(
                url=g.get("url", ""),
                pgn=g.get("pgn", ""),
                white=white_info.get("username", "?"),
                black=black_info.get("username", "?"),
                result=_chess_com_result(white_info, black_info),
                date=_format_timestamp(g.get("end_time")),
                time_class=g.get("time_class", ""),
            )
        )
    return summaries


def _format_timestamp(ts: int | str | None) -> str:
    if not ts:
        return ""
    if isinstance(ts, str):
        return ts[:10]  # already a date/datetime string
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


def _chess_com_result(white: dict, black: dict) -> str:
    w = white.get("result", "")
    if w == "win":
        return "1-0"
    if w == "checkmated" or w == "resigned" or w == "timeout" or w == "abandoned":
        return "0-1"
    return "1/2-1/2"


async def fetch_lichess_games(username: str, count: int = 20) -> list[GameSummary]:
    """Fetch recent games from lichess public API (NDJSON)."""
    url = f"https://lichess.org/api/games/user/{username.lower()}"
    params = {"max": count, "pgnInJson": "true", "moves": "true"}
    headers = {"Accept": "application/x-ndjson"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params, headers=headers)
        resp.raise_for_status()

    import json

    summaries: list[GameSummary] = []
    for line in resp.text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            g = json.loads(line)
        except json.JSONDecodeError:
            continue

        players = g.get("players", {})
        white_user = players.get("white", {}).get("user", {}).get("name", "?")
        black_user = players.get("black", {}).get("user", {}).get("name", "?")

        status = g.get("status", "")
        winner = g.get("winner", "")
        if winner == "white":
            result = "1-0"
        elif winner == "black":
            result = "0-1"
        elif status in ("draw", "stalemate"):
            result = "1/2-1/2"
        else:
            result = "*"

        created_at = g.get("createdAt", "")
        date_str = str(created_at)[:10] if created_at else "?"

        summaries.append(
            GameSummary(
                url=f"https://lichess.org/{g.get('id', '')}",
                pgn=g.get("pgn", ""),
                white=white_user,
                black=black_user,
                result=result,
                date=date_str,
                time_class=g.get("speed", ""),
            )
        )
    return summaries
