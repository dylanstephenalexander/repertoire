from pydantic import BaseModel

from app.models.feedback import AnalysisLine


class EvalRequest(BaseModel):
    fen: str


class EvalResponse(BaseModel):
    lines: list[AnalysisLine]  # top N, best first
    depth: int
    eval_cp: int | None       # best line cp (side to move)
