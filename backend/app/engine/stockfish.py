import os
import subprocess
import threading
from pathlib import Path


# Configurable via env var for non-macOS deployments
_DEFAULT_BINARY = Path(__file__).parent.parent / "data" / "bin" / "stockfish"
STOCKFISH_PATH = os.environ.get("STOCKFISH_PATH", str(_DEFAULT_BINARY))


class StockfishEngine:
    """
    Thin UCI wrapper around a Stockfish subprocess.
    Not thread-safe — callers must serialize access.
    """

    def __init__(self, path: str = STOCKFISH_PATH, depth: int = 15):
        self._path = path
        self._depth = depth
        self._proc: subprocess.Popen | None = None
        self._lock = threading.Lock()

    def start(self) -> None:
        self._proc = subprocess.Popen(
            [self._path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self._send("uci")
        self._wait_for("uciok")
        self._send("isready")
        self._wait_for("readyok")

    def stop(self) -> None:
        if self._proc:
            self._send("quit")
            self._proc.wait(timeout=3)
            self._proc = None

    def set_elo(self, elo: int) -> None:
        self._send("setoption name UCI_LimitStrength value true")
        self._send(f"setoption name UCI_Elo value {elo}")

    def clear_elo(self) -> None:
        self._send("setoption name UCI_LimitStrength value false")

    def analyse(self, fen: str, moves: list[str] | None = None) -> dict:
        """Return {'eval_cp': int, 'best_move': str} for the given position."""
        with self._lock:
            self._set_position(fen, moves)
            self._send(f"go depth {self._depth}")
            return self._collect_go_result()

    def best_move(self, fen: str, moves: list[str] | None = None) -> str:
        return self.analyse(fen, moves)["best_move"]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _send(self, cmd: str) -> None:
        assert self._proc and self._proc.stdin
        self._proc.stdin.write(cmd + "\n")
        self._proc.stdin.flush()

    def _readline(self) -> str:
        assert self._proc and self._proc.stdout
        return self._proc.stdout.readline().strip()

    def _wait_for(self, token: str) -> None:
        while True:
            line = self._readline()
            if line.startswith(token):
                return

    def _set_position(self, fen: str, moves: list[str] | None) -> None:
        if moves:
            self._send(f"position fen {fen} moves {' '.join(moves)}")
        else:
            self._send(f"position fen {fen}")

    def _collect_go_result(self) -> dict:
        eval_cp: int | None = None
        best_move: str | None = None
        while True:
            line = self._readline()
            if line.startswith("info") and "score cp" in line:
                parts = line.split()
                idx = parts.index("cp")
                eval_cp = int(parts[idx + 1])
            if line.startswith("bestmove"):
                best_move = line.split()[1]
                break
        return {"eval_cp": eval_cp, "best_move": best_move}
