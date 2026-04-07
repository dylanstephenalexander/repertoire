from typing import Literal

from pydantic import BaseModel


class MoveAnnotation(BaseModel):
    move_number: int
    color: Literal["white", "black"]
    move_san: str
    move_uci: str
    quality: Literal["best", "good", "inaccuracy", "mistake", "blunder"]
    cp_loss: int | None
    best_move_san: str | None
    explanation: str | None
    fen_before: str
    eval_cp: int | None  # always from white's perspective, for the eval bar


class GameSummary(BaseModel):
    url: str
    pgn: str
    white: str
    black: str
    result: str
    date: str
    time_class: str


class ReviewRequest(BaseModel):
    pgn: str


class ReviewResponse(BaseModel):
    white: str
    black: str
    result: str
    moves: list[MoveAnnotation]
