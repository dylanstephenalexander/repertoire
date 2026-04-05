import { useCallback, useState } from "react";
import { fetchOpponentMove, sendMove, startSession } from "../api/session";
import type { SessionStartParams } from "../api/session";
import type { Feedback } from "../types";

type SessionStatus =
  | "idle"
  | "opponent_thinking"
  | "playing"
  | "complete";

interface SessionState {
  sessionId: string;
  fen: string;
  userColor: "white" | "black";
  status: SessionStatus;
  feedback: Feedback | null;
  score: number;
  moveCount: number;
}

interface UseSessionReturn {
  session: SessionState | null;
  begin: (params: SessionStartParams) => Promise<void>;
  move: (uciMove: string) => Promise<void>;
}

const OPPONENT_THINKING_MS = 1000;

export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<SessionState | null>(null);

  const triggerOpponentMove = useCallback(
    async (sessionId: string, score: number, moveCount: number) => {
      setSession((s) =>
        s ? { ...s, status: "opponent_thinking", feedback: null } : s
      );

      await new Promise((r) => setTimeout(r, OPPONENT_THINKING_MS));

      try {
        const resp = await fetchOpponentMove(sessionId);
        setSession((s) =>
          s
            ? {
                ...s,
                fen: resp.fen,
                status: "playing",
                score,
                moveCount: moveCount + 1,
              }
            : s
        );
      } catch {
        // End of opening line — no more opponent moves
        setSession((s) =>
          s ? { ...s, status: "complete", score, moveCount } : s
        );
      }
    },
    []
  );

  const begin = useCallback(
    async (params: SessionStartParams) => {
      const resp = await startSession(params);
      const initial: SessionState = {
        sessionId: resp.session_id,
        fen: resp.fen,
        userColor: params.color,
        status: "playing",
        feedback: null,
        score: 0,
        moveCount: 0,
      };
      setSession(initial);

      // If user is black, white moves first
      if (params.color === "black") {
        await triggerOpponentMove(resp.session_id, 0, 0);
      }
    },
    [triggerOpponentMove]
  );

  const move = useCallback(
    async (uciMove: string) => {
      if (!session || session.status !== "playing") return;

      const resp = await sendMove(session.sessionId, uciMove);
      const newScore =
        resp.result === "correct" ? session.score + 1 : session.score;
      const newMoveCount = session.moveCount + 1;

      setSession((s) =>
        s
          ? {
              ...s,
              fen: resp.fen,
              feedback: resp.feedback,
              score: newScore,
              moveCount: newMoveCount,
            }
          : s
      );

      if (resp.result === "correct") {
        await triggerOpponentMove(session.sessionId, newScore, newMoveCount);
      }
    },
    [session, triggerOpponentMove]
  );

  return { session, begin, move };
}
