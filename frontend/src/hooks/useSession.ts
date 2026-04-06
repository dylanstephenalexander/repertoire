import { useCallback, useRef, useState } from "react";
import { Chess } from "chess.js";
import { fetchHint, fetchOpponentMove, sendMove, startSession, undoMove } from "../api/session";
import type { SessionStartParams } from "../api/session";
import type { Feedback } from "../types";

/** Returns a checkmate Feedback if the position is terminal, otherwise null. */
function checkmateFeedback(fen: string, userColor: "white" | "black"): Feedback | null {
  try {
    const chess = new Chess(fen);
    if (!chess.isCheckmate()) return null;
    const userWon = (chess.turn() === "w") === (userColor === "black");
    return {
      quality: "checkmate",
      explanation: userWon ? "Checkmate! You won." : "Checkmate. Your opponent won.",
      centipawn_loss: null,
      lines: null,
    };
  } catch {
    return null;
  }
}

type SessionStatus =
  | "idle"
  | "opponent_thinking"
  | "playing"
  | "awaiting_decision"
  | "complete";

interface SessionState {
  sessionId: string;
  fen: string;
  userColor: "white" | "black";
  status: SessionStatus;
  feedback: Feedback | null;
  score: number;
  moveCount: number;
  hint: { san: string; uci: string } | null;
}

interface UseSessionReturn {
  session: SessionState | null;
  begin: (params: SessionStartParams) => Promise<void>;
  move: (uciMove: string) => Promise<void>;
  retry: () => Promise<void>;
  continuePlay: () => Promise<void>;
  restart: () => Promise<void>;
  requestHint: () => Promise<void>;
  clearSession: () => void;
}

// Minimum time the "thinking" state is shown — runs in parallel with the fetch,
// so total disabled time = max(MIN_THINKING_MS, network latency), not the sum.
const MIN_THINKING_MS = 500;

export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<SessionState | null>(null);
  // Keep latest params so restart can replay the same session
  const lastParams = useRef<SessionStartParams | null>(null);

  const triggerOpponentMove = useCallback(
    async (sessionId: string, score: number, moveCount: number) => {
      setSession((s) =>
        s ? { ...s, status: "opponent_thinking", feedback: null } : s
      );

      // Fetch and timer run in parallel — disabled time = max(MIN_THINKING_MS, network)
      const [resp] = await Promise.all([
        fetchOpponentMove(sessionId).catch(() => null),
        new Promise((r) => setTimeout(r, MIN_THINKING_MS)),
      ]);

      if (resp) {
        setSession((s) => {
          if (!s) return s;
          const mate = checkmateFeedback(resp.fen, s.userColor);
          return {
            ...s,
            fen: resp.fen,
            status: mate || resp.line_complete ? "complete" : "playing",
            feedback: mate ?? s.feedback,
            score,
            moveCount,
          };
        });
      } else {
        // fetchOpponentMove threw — end of opening line, no opponent move available
        setSession((s) =>
          s ? { ...s, status: "complete", score, moveCount } : s
        );
      }
    },
    []
  );

  const begin = useCallback(
    async (params: SessionStartParams) => {
      lastParams.current = params;
      const resp = await startSession(params);
      const initial: SessionState = {
        sessionId: resp.session_id,
        fen: resp.fen,
        userColor: params.color,
        status: "playing",
        feedback: null,
        score: 0,
        moveCount: 0,
        hint: null,
      };
      setSession(initial);

      if (params.color === "black") {
        await triggerOpponentMove(resp.session_id, 0, 0);
      }
    },
    [triggerOpponentMove]
  );

  const move = useCallback(
    async (uciMove: string) => {
      if (!session || session.status !== "playing") return;

      // Clear any active hint and optimistically move the piece
      setSession((s) => (s ? { ...s, hint: null } : s));
      const chess = new Chess(session.fen);
      const from = uciMove.slice(0, 2);
      const to = uciMove.slice(2, 4);
      const promotion = uciMove.length === 5 ? uciMove[4] : undefined;
      chess.move({ from, to, promotion });
      const optimisticFen = chess.fen();
      setSession((s) => (s ? { ...s, fen: optimisticFen } : s));

      const resp = await sendMove(session.sessionId, uciMove);
      const newScore =
        resp.result === "correct" ? session.score + 1 : session.score;
      const newMoveCount = session.moveCount + 1;
      const mate = checkmateFeedback(resp.fen, session.userColor);

      setSession((s) =>
        s
          ? {
              ...s,
              fen: resp.fen,
              feedback: mate ?? resp.feedback,
              score: newScore,
              moveCount: newMoveCount,
              ...(mate ? { status: "complete" as const } : {}),
            }
          : s
      );

      if (resp.result === "correct") {
        await triggerOpponentMove(session.sessionId, newScore, newMoveCount);
      } else {
        setSession((s) => (s ? { ...s, status: "awaiting_decision" } : s));
      }
    },
    [session, triggerOpponentMove]
  );

  const retry = useCallback(async () => {
    if (!session) return;
    const { fen } = await undoMove(session.sessionId);
    setSession((s) =>
      s ? { ...s, fen, status: "playing", feedback: null } : s
    );
  }, [session]);

  // Continue: accept the off-tree position and let the opponent respond.
  // The backend falls back to engine best move when off-tree.
  const continuePlay = useCallback(async () => {
    if (!session) return;
    setSession((s) => (s ? { ...s, feedback: null } : s));
    await triggerOpponentMove(session.sessionId, session.score, session.moveCount);
  }, [session, triggerOpponentMove]);

  // Restart: replay the exact same opening/variation/skill without going to the menu.
  const restart = useCallback(async () => {
    if (!lastParams.current) return;
    await begin(lastParams.current);
  }, [begin]);

  const hintInFlight = useRef(false);

  const requestHint = useCallback(async () => {
    if (!session || session.status !== "playing" || hintInFlight.current) return;
    hintInFlight.current = true;
    try {
      const { move_san, move_uci } = await fetchHint(session.sessionId);
      setSession((s) => (s ? { ...s, hint: { san: move_san, uci: move_uci } } : s));
    } catch {
      setSession((s) => (s ? { ...s, hint: { san: "No hint available", uci: "" } } : s));
    } finally {
      hintInFlight.current = false;
    }
  }, [session]);

  const clearSession = useCallback(() => {
    setSession(null);
    lastParams.current = null;
  }, []);

  return { session, begin, move, retry, continuePlay, restart, requestHint, clearSession };
}
