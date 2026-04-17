from typing import Any, Literal

from pydantic import BaseModel, Field


class SessionStartRequest(BaseModel):
    opening_id: str
    variation_id: str
    color: Literal["white", "black"]
    mode: Literal["study", "chaos"]
    elo: int | None = Field(default=None, ge=600, le=3200)


class SessionStartResponse(BaseModel):
    session_id: str
    fen: str
    to_move: str  # "white" | "black"


class SessionState(BaseModel):
    session_id: str
    opening_id: str
    variation_id: str
    color: str
    mode: str
    elo: int | None
    current_fen: str
    move_history: list[str]
    score: int
    tree_cursor: dict[str, Any]


class MoveRequest(BaseModel):
    uci_move: str = Field(..., min_length=4, max_length=5, pattern=r"^[a-h][1-8][a-h][1-8][qrbn]?$")


class OpponentMoveResponse(BaseModel):
    uci_move: str
    fen: str
    line_complete: bool = False  # True when cursor is empty after this move
