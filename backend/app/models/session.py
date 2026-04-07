from pydantic import BaseModel
from typing import Any


class SessionStartRequest(BaseModel):
    opening_id: str
    variation_id: str
    color: str  # "white" | "black"
    mode: str  # "study" | "chaos"
    elo: int | None = None


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
    # Stored before each off-tree move so the client can request an undo
    prev_fen: str | None = None
    prev_cursor: dict[str, Any] | None = None


class MoveRequest(BaseModel):
    uci_move: str


class OpponentMoveResponse(BaseModel):
    uci_move: str
    fen: str
    line_complete: bool = False  # True when cursor is empty after this move
