import { useCallback, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  fetchChaosExplanation,
  fetchChaosOpponentMove,
  fetchEngineStatus,
  sendChaosMove,
  startChaos,
} from "../api/chaos";
import type { ChaosStartParams } from "../api/chaos";
import type { Feedback, PositionEntry } from "../types";

async function fetchChaosExplanationOnce(
  sessionId: string,
  signal: { aborted: boolean },
  onReady: (explanation: string | null, llmDebug: string) => void,
  onGiveUp: () => void,
) {
  // ONE request — backend long-polls until the LLM finishes (or its own timeout).
  // No loop, no interval, no rate-limit risk.
  try {
    const resp = await fetchChaosExplanation(sessionId);
    if (signal.aborted) return;
    if (resp.llm_debug !== null) {
      onReady(resp.explanation, resp.llm_debug);
    } else {
      onGiveUp();
    }
  } catch {
    if (!signal.aborted) onGiveUp();
  }
}

function terminalFeedback(fen: string, userColor: "white" | "black"): Feedback | null {
  try {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) {
      const userWon = (chess.turn() === "w") === (userColor === "black");
      return {
        quality: "checkmate",
        explanation: userWon ? "Checkmate! You won." : "Checkmate. Your opponent won.",
        centipawn_loss: null,
        lines: null,
      };
    }
    if (chess.isDraw()) {
      let explanation = "Draw.";
      if (chess.isStalemate()) explanation = "Draw by stalemate.";
      else if (chess.isThreefoldRepetition()) explanation = "Draw by threefold repetition.";
      else if (chess.isInsufficientMaterial()) explanation = "Draw by insufficient material.";
      return { quality: "draw", explanation, centipawn_loss: null, lines: null };
    }
    return null;
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
  debugMsg: string | null;
  llmDebugMsg: string | null;
  explanationPending: boolean;
  opponentMoveDebug: string | null;
  openingName: string | null;
  inTheory: boolean;
  eloBand: number;
  feedbackEnabled: boolean;
  positions: PositionEntry[];
  viewIndex: number | null;
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
  clearChaosSession: () => void;
  restartChaos: () => Promise<void>;
  goToChaosIndex: (i: number | null) => void;
  updateChaosPositionEval: (fen: string, cp: number) => void;
}

let _thinkingDelayOverride: number | null = null;
export function _setThinkingDelayForTest(ms: number | null) { _thinkingDelayOverride = ms; }
function thinkingDelay() { return _thinkingDelayOverride ?? (500 + Math.random() * 4500); }

export function useChaos(): UseChaosReturn {
  const [chaosSession, setChaosSession] = useState<ChaosState | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const lastParams = useRef<ChaosStartParams | null>(null);
  const abortExplanationPollRef = useRef<{ aborted: boolean } | null>(null);
  const movePendingRef = useRef(false);

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

      const delay = thinkingDelay();
      const t0 = Date.now();
      const [resp] = await Promise.all([
        fetchChaosOpponentMove(sessionId).catch(() => null),
        new Promise((r) => setTimeout(r, delay)),
      ]);
      const totalMs = Date.now() - t0;

      if (resp) {
        setChaosSession((s) => {
          if (!s) return s;
          let opponentSan: string = resp.uci_move;
          try {
            const chess = new Chess(s.fen);
            const result = chess.move({
              from: resp.uci_move.slice(0, 2),
              to: resp.uci_move.slice(2, 4),
              promotion: resp.uci_move.length > 4 ? resp.uci_move[4] : undefined,
            });
            opponentSan = result?.san ?? resp.uci_move;
          } catch { /* fall back to UCI */ }

          const mate = terminalFeedback(resp.fen, s.userColor);
          const maiaMs = (resp.opponent_move_time ?? 0) * 1000;
          const waitMs = Math.max(0, totalMs - maiaMs);
          const engineLabel = resp.opponent_engine ?? "engine";
          const opponentMoveDebug = resp.opponent_move_time != null
            ? `Maia (${engineLabel}): ${resp.opponent_move_time.toFixed(2)}s\nWait: ${(waitMs / 1000).toFixed(2)}s`
            : null;
          const newPosition: PositionEntry = { fen: resp.fen, san: opponentSan, feedback: null, evalCp: null };
          return {
            ...s,
            fen: resp.fen,
            positions: [...s.positions, newPosition],
            status: mate ? "complete" : "playing",
            feedback: mate ?? s.feedback,
            opponentMoveDebug,
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
        debugMsg: null,
        llmDebugMsg: null,
        explanationPending: false,
        opponentMoveDebug: null,
        openingName: null,
        inTheory: false,
        eloBand: params.elo_band,
        feedbackEnabled: true,
        positions: [{ fen: resp.fen, san: null, feedback: null, evalCp: null }],
        viewIndex: null,
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
      if (movePendingRef.current) return;
      movePendingRef.current = true;

      try {
      const userMovePositionIdx = chaosSession.positions.length;

      // Optimistic update
      const chess = new Chess(chaosSession.fen);
      const moveResult = chess.move({
        from: uciMove.slice(0, 2),
        to: uciMove.slice(2, 4),
        promotion: uciMove.length === 5 ? uciMove[4] : undefined,
      });
      const playedSan = moveResult?.san ?? uciMove;
      const optimisticFen = chess.fen();
      setChaosSession((s) => (s ? { ...s, fen: optimisticFen, feedback: null } : s));

      const resp = await sendChaosMove(
        chaosSession.sessionId,
        uciMove,
        chaosSession.feedbackEnabled,
      );

      const userColor = chaosSession.userColor;
      const capturedSessionId = chaosSession.sessionId;
      const mate = terminalFeedback(resp.fen, userColor);
      const quality = resp.feedback?.quality;
      const isMistakeOrBlunder = quality === "mistake" || quality === "blunder";
      const newPosition: PositionEntry = {
        fen: resp.fen,
        san: playedSan,
        feedback: resp.feedback ?? null,
        evalCp: null,
      };

      setChaosSession((s) => {
        if (!s) return s;
        return {
          ...s,
          fen: resp.fen,
          feedback: mate ?? resp.feedback ?? null,
          debugMsg: resp.debug_msg ?? null,
          llmDebugMsg: null,
          explanationPending: !mate && isMistakeOrBlunder,
          openingName: resp.opening_name ?? s.openingName,
          inTheory: resp.in_theory,
          positions: [...s.positions, newPosition],
          viewIndex: null,
          ...(mate ? { status: "complete" as const } : {}),
        };
      });

      if (!mate && isMistakeOrBlunder) {
        if (abortExplanationPollRef.current) abortExplanationPollRef.current.aborted = true;
        const signal = { aborted: false };
        abortExplanationPollRef.current = signal;
        fetchChaosExplanationOnce(
          capturedSessionId,
          signal,
          (explanation, llmDebug) => {
            setChaosSession((s) => {
              if (!s || s.sessionId !== capturedSessionId) return s;
              const updatedPositions = explanation
                ? s.positions.map((p, i) =>
                    i === userMovePositionIdx && p.feedback
                      ? { ...p, feedback: { ...p.feedback, explanation, llm_explanation: true } }
                      : p
                  )
                : s.positions;
              return {
                ...s,
                explanationPending: false,
                llmDebugMsg: llmDebug,
                feedback: s.feedback && explanation
                  ? { ...s.feedback, explanation, llm_explanation: true }
                  : s.feedback,
                positions: updatedPositions,
              };
            });
          },
          () => {
            setChaosSession((s) => {
              if (!s || s.sessionId !== capturedSessionId) return s;
              return { ...s, explanationPending: false };
            });
          },
        );
      }

      if (!mate) {
        await triggerOpponentMove(capturedSessionId);
      }
      } finally {
        movePendingRef.current = false;
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

  const goToChaosIndex = useCallback((i: number | null) => {
    setChaosSession((s) => {
      if (!s) return s;
      const normalized = i !== null && i >= s.positions.length - 1 ? null : i;
      return { ...s, viewIndex: normalized };
    });
  }, []);

  const updateChaosPositionEval = useCallback((fen: string, cp: number) => {
    setChaosSession((s) => {
      if (!s) return s;
      const positions = s.positions.map((p) =>
        p.fen === fen && p.evalCp === null ? { ...p, evalCp: cp } : p
      );
      return { ...s, positions };
    });
  }, []);

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
    goToChaosIndex,
    updateChaosPositionEval,
  };
}
