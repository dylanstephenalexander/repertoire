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
    llm_explanation: bool = False  # skip SAN→English translation on frontend


class MoveResult(BaseModel):
    result: str  # "correct" | "alternative" | "mistake" | "blunder" | "rejected"
    feedback: Feedback | None = None
    fen: str
    eval_cp: int | None = None
    debug_msg: str | None = None
