from pydantic import BaseModel


class Feedback(BaseModel):
    quality: str  # "correct" | "alternative" | "mistake" | "blunder"
    explanation: str
    centipawn_loss: int | None = None
    best_move: str | None = None  # UCI notation


class MoveResult(BaseModel):
    result: str  # "correct" | "alternative" | "mistake" | "blunder" | "end"
    feedback: Feedback
    fen: str
    eval_cp: int | None = None
    best_move: str | None = None
