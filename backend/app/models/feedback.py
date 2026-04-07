from pydantic import BaseModel


class AnalysisLine(BaseModel):
    move_uci: str
    move_san: str
    cp: int


class Feedback(BaseModel):
    quality: str  # "correct" | "alternative" | "mistake" | "blunder"
    explanation: str
    centipawn_loss: int | None = None
    lines: list[AnalysisLine] | None = None  # top N candidates from pre-move position


class MoveResult(BaseModel):
    result: str  # "correct" | "alternative" | "mistake" | "blunder" | "end"
    feedback: Feedback
    fen: str
    eval_cp: int | None = None   # best line cp after the move
    debug_msg: str | None = None  # temporary: pre-eval cache diagnostics
