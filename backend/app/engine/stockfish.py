import os
import subprocess
import threading
from pathlib import Path

# Configurable via env var for non-macOS deployments
_DEFAULT_BINARY = Path(__file__).parent.parent / "data" / "bin" / "stockfish"
STOCKFISH_PATH = os.environ.get("STOCKFISH_PATH", str(_DEFAULT_BINARY))

DEFAULT_DEPTH = 15
DEFAULT_MULTIPV = 3


class AnalysisLine:
    __slots__ = ("move_uci", "cp")

    def __init__(self, move_uci: str, cp: int):
        self.move_uci = move_uci
        self.cp = cp


class StockfishEngine:
    """
    Thin UCI wrapper around a Stockfish subprocess.
    Not thread-safe — callers must serialize access.
    """

    def __init__(
        self,
        path: str = STOCKFISH_PATH,
        depth: int = DEFAULT_DEPTH,
        multipv: int = DEFAULT_MULTIPV,
    ):
        self._path = path
        self._depth = depth
        self._multipv = multipv
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
        """
        Analyse a position and return top lines.

        Returns:
          {
            "eval_cp": int,          # centipawns for side to move (best line)
            "best_move": str,        # UCI of best move
            "lines": [               # top N lines, best first
              {"move_uci": str, "cp": int},
              ...
            ]
          }
        """
        with self._lock:
            self._send(f"setoption name MultiPV value {self._multipv}")
            self._set_position(fen, moves)
            self._send(f"go depth {self._depth}")
            return self._collect_multipv_result()

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
            if self._readline().startswith(token):
                return

    def _set_position(self, fen: str, moves: list[str] | None) -> None:
        if moves:
            self._send(f"position fen {fen} moves {' '.join(moves)}")
        else:
            self._send(f"position fen {fen}")

    def _collect_multipv_result(self) -> dict:
        # Track the latest info line per multipv index at the deepest depth seen
        best_by_pv: dict[int, dict] = {}   # pv_index -> {cp, move}
        best_depth = 0

        while True:
            line = self._readline()

            if line.startswith("info") and "multipv" in line and "score cp" in line:
                parts = line.split()
                try:
                    depth = int(parts[parts.index("depth") + 1])
                    pv_idx = int(parts[parts.index("multipv") + 1])
                    cp = int(parts[parts.index("cp") + 1])
                    # First move in the pv is what we want
                    pv_pos = parts.index("pv")
                    move = parts[pv_pos + 1]
                except (ValueError, IndexError):
                    continue

                if depth >= best_depth:
                    best_depth = depth
                    best_by_pv[pv_idx] = {"cp": cp, "move": move}

            elif line.startswith("info") and "score mate" in line:
                # Treat mate as large cp value
                parts = line.split()
                try:
                    depth = int(parts[parts.index("depth") + 1])
                    pv_idx = int(parts[parts.index("multipv") + 1]) if "multipv" in parts else 1
                    mate_in = int(parts[parts.index("mate") + 1])
                    cp = 30000 if mate_in > 0 else -30000
                    pv_pos = parts.index("pv")
                    move = parts[pv_pos + 1]
                except (ValueError, IndexError):
                    continue
                if depth >= best_depth:
                    best_depth = depth
                    best_by_pv[pv_idx] = {"cp": cp, "move": move}

            elif line.startswith("bestmove"):
                break

        lines = [
            {"move_uci": best_by_pv[i]["move"], "cp": best_by_pv[i]["cp"]}
            for i in sorted(best_by_pv)
            if i in best_by_pv
        ]
        best = lines[0] if lines else None
        return {
            "eval_cp": best["cp"] if best else None,
            "best_move": best["move_uci"] if best else None,
            "lines": lines,
        }
