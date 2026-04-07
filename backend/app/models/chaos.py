from pydantic import BaseModel

from app.models.feedback import Feedback


class EngineStatusResponse(BaseModel):
    lc0: bool
    maia_models: list[int]


class ChaosStartRequest(BaseModel):
    color: str           # "white" | "black" | "random"
    elo_band: int        # 1100–1900 for Maia, 2000 for full Stockfish


class ChaosStartResponse(BaseModel):
    session_id: str
    fen: str
    user_color: str      # "white" | "black" — resolved if random


class ChaosMoveRequest(BaseModel):
    uci_move: str
    feedback_enabled: bool = True


class ChaosMoveResponse(BaseModel):
    fen: str
    feedback: Feedback | None = None
    opening_name: str | None = None   # most specific theory name seen so far
    in_theory: bool = False           # True if this exact position is in the explorer
    debug_msg: str | None = None      # temporary: pre-eval cache diagnostics


class ChaosOpponentMoveResponse(BaseModel):
    uci_move: str
    fen: str
    opening_name: str | None = None
    in_theory: bool = False
    opponent_move_time: float | None = None   # seconds engine spent computing the move
    opponent_engine: str | None = None        # "Maia" | "Stockfish"
