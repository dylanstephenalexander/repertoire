import { useCallback, useRef, useState } from "react";
import { Chess } from "chess.js";
import { fetchOpponentMove, sendMove, startSession, undoMove } from "../api/session";
import type { SessionStartParams } from "../api/session";
import type { Feedback } from "../types";

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
}

interface UseSessionReturn {
  session: SessionState | null;
  begin: (params: SessionStartParams) => Promise<void>;
  move: (uciMove: string) => Promise<void>;
  retry: () => Promise<void>;
  continuePlay: () => Promise<void>;
  restart: () => Promise<void>;
}

const OPPONENT_THINKING_MS = 1000;

export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<SessionState | null>(null);
  // Keep latest params so restart can replay the same session
  const lastParams = useRef<SessionStartParams | null>(null);

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

      // Optimistic update: move the piece immediately so the board responds
      // before the backend round-trip completes.
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

  return { session, begin, move, retry, continuePlay, restart };
}
