from pydantic import BaseModel
from typing import Any


class SessionStartRequest(BaseModel):
    opening_id: str
    variation_id: str
    color: str  # "white" | "black"
    mode: str  # "study" | "chaos"
    elo: int | None = None
    skill_level: str = "intermediate"  # "beginner" | "intermediate" | "advanced"


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
    skill_level: str
    current_fen: str
    move_history: list[str]
    score: int
    tree_cursor: dict[str, Any]


class MoveRequest(BaseModel):
    uci_move: str


class OpponentMoveResponse(BaseModel):
    uci_move: str
    fen: str
