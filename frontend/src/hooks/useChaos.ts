import { useCallback, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  fetchChaosOpponentMove,
  fetchEngineStatus,
  sendChaosMove,
  startChaos,
} from "../api/chaos";
import type { ChaosStartParams } from "../api/chaos";
import type { Feedback } from "../types";

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

type ChaosStatus =
  | "idle"
  | "opponent_thinking"
  | "playing"
  | "complete";

interface ChaosState {
  sessionId: string;
  fen: string;
  userColor: "white" | "black";
  status: ChaosStatus;
  feedback: Feedback | null;
  openingName: string | null;
  inTheory: boolean;
  eloBand: number;
  feedbackEnabled: boolean;
}

interface EngineStatus {
  lc0: boolean;
  maiaModels: number[];
}

interface UseChaosReturn {
  chaosSession: ChaosState | null;
  engineStatus: EngineStatus | null;
  checkEngineStatus: () => Promise<void>;
  beginChaos: (params: ChaosStartParams) => Promise<void>;
  chaosMove: (uciMove: string) => Promise<void>;
  toggleFeedback: () => void;
  resign: () => void;
}

const MIN_THINKING_MS = 500;

export function useChaos(): UseChaosReturn {
  const [chaosSession, setChaosSession] = useState<ChaosState | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const lastParams = useRef<ChaosStartParams | null>(null);

  const checkEngineStatus = useCallback(async () => {
    try {
      const resp = await fetchEngineStatus();
      setEngineStatus({ lc0: resp.lc0, maiaModels: resp.maia_models });
    } catch {
      setEngineStatus({ lc0: false, maiaModels: [] });
    }
  }, []);

  const triggerOpponentMove = useCallback(
    async (sessionId: string) => {
      setChaosSession((s) =>
        s ? { ...s, status: "opponent_thinking" } : s
      );

      const [resp] = await Promise.all([
        fetchChaosOpponentMove(sessionId).catch(() => null),
        new Promise((r) => setTimeout(r, MIN_THINKING_MS)),
      ]);

      if (resp) {
        setChaosSession((s) => {
          if (!s) return s;
          const mate = checkmateFeedback(resp.fen, s.userColor);
          return {
            ...s,
            fen: resp.fen,
            status: mate ? "complete" : "playing",
            feedback: mate ?? s.feedback,
            openingName: resp.opening_name ?? s.openingName,
            inTheory: resp.in_theory,
          };
        });
      } else {
        setChaosSession((s) => (s ? { ...s, status: "complete" } : s));
      }
    },
    []
  );

  const beginChaos = useCallback(
    async (params: ChaosStartParams) => {
      lastParams.current = params;
      const resp = await startChaos(params);
      const initial: ChaosState = {
        sessionId: resp.session_id,
        fen: resp.fen,
        userColor: resp.user_color,
        status: "playing",
        feedback: null,
        openingName: null,
        inTheory: false,
        eloBand: params.elo_band,
        feedbackEnabled: true,
      };
      setChaosSession(initial);

      if (resp.user_color === "black") {
        await triggerOpponentMove(resp.session_id);
      }
    },
    [triggerOpponentMove]
  );

  const chaosMove = useCallback(
    async (uciMove: string) => {
      if (!chaosSession || chaosSession.status !== "playing") return;

      // Optimistic update
      const chess = new Chess(chaosSession.fen);
      chess.move({
        from: uciMove.slice(0, 2),
        to: uciMove.slice(2, 4),
        promotion: uciMove.length === 5 ? uciMove[4] : undefined,
      });
      const optimisticFen = chess.fen();
      setChaosSession((s) => (s ? { ...s, fen: optimisticFen, feedback: null } : s));

      const resp = await sendChaosMove(
        chaosSession.sessionId,
        uciMove,
        chaosSession.feedbackEnabled,
      );

      const userColor = chaosSession.userColor;
      setChaosSession((s) => {
        if (!s) return s;
        const mate = checkmateFeedback(resp.fen, userColor);
        return {
          ...s,
          fen: resp.fen,
          feedback: mate ?? resp.feedback ?? null,
          openingName: resp.opening_name ?? s.openingName,
          inTheory: resp.in_theory,
          ...(mate ? { status: "complete" as const } : {}),
        };
      });

      // Only trigger opponent move if user didn't just deliver checkmate
      const postMoveBoard = new Chess(resp.fen);
      if (!postMoveBoard.isCheckmate()) {
        await triggerOpponentMove(chaosSession.sessionId);
      }
    },
    [chaosSession, triggerOpponentMove]
  );

  const toggleFeedback = useCallback(() => {
    setChaosSession((s) =>
      s ? { ...s, feedbackEnabled: !s.feedbackEnabled } : s
    );
  }, []);

  const resign = useCallback(() => {
    setChaosSession((s) => (s ? { ...s, status: "complete" } : s));
  }, []);

  const clearChaosSession = useCallback(() => {
    setChaosSession(null);
    lastParams.current = null;
  }, []);

  const restartChaos = useCallback(async () => {
    if (!lastParams.current) return;
    await beginChaos(lastParams.current);
  }, [beginChaos]);

  return {
    chaosSession,
    engineStatus,
    checkEngineStatus,
    beginChaos,
    chaosMove,
    toggleFeedback,
    resign,
    clearChaosSession,
    restartChaos,
  };
}
