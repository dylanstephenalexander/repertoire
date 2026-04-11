import { useCallback, useRef, useState } from "react";
import { Chess } from "chess.js";
import { fetchExplanation, fetchHint, fetchOpponentMove, sendMove, startSession, undoMove } from "../api/session";
import type { SessionStartParams } from "../api/session";
import type { Feedback, PositionEntry } from "../types";

async function fetchExplanationOnce(
  sessionId: string,
  signal: { aborted: boolean },
  onReady: (explanation: string | null, llmDebug: string) => void,
  onGiveUp: () => void,
) {
  // ONE request — backend long-polls until the LLM finishes (or its own timeout).
  // No loop, no interval, no rate-limit risk.
  try {
    const resp = await fetchExplanation(sessionId);
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

/** Returns terminal Feedback (checkmate or draw) if the game is over, otherwise null. */
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
  debugMsg: string | null;
  llmDebugMsg: string | null;
  explanationPending: boolean;
  score: number;
  moveCount: number;
  hint: { san: string; uci: string } | null;
  positions: PositionEntry[];
  viewIndex: number | null; // null = live; 0 = start; n = after nth half-move
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
  goToIndex: (i: number | null) => void;
  updatePositionEval: (fen: string, cp: number) => void;
}

let _thinkingDelayOverride: number | null = null;
export function _setThinkingDelayForTest(ms: number | null) { _thinkingDelayOverride = ms; }
function thinkingDelay() { return _thinkingDelayOverride ?? (500 + Math.random() * 4500); }

export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<SessionState | null>(null);
  const lastParams = useRef<SessionStartParams | null>(null);
  const abortExplanationPollRef = useRef<{ aborted: boolean } | null>(null);
  const movePendingRef = useRef(false);

  const triggerOpponentMove = useCallback(
    async (sessionId: string, score: number, moveCount: number) => {
      setSession((s) =>
        s ? { ...s, status: "opponent_thinking", feedback: null } : s
      );

      const [resp] = await Promise.all([
        fetchOpponentMove(sessionId).catch(() => null),
        new Promise((r) => setTimeout(r, thinkingDelay())),
      ]);

      if (resp) {
        setSession((s) => {
          if (!s) return s;
          // Compute opponent SAN from pre-move FEN (s.fen) + UCI
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
          const newPosition: PositionEntry = { fen: resp.fen, san: opponentSan, feedback: null, evalCp: null };
          return {
            ...s,
            fen: resp.fen,
            positions: [...s.positions, newPosition],
            status: mate || resp.line_complete ? "complete" : "playing",
            feedback: mate ?? s.feedback,
            score,
            moveCount,
          };
        });
      } else {
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
        debugMsg: null,
        llmDebugMsg: null,
        explanationPending: false,
        score: 0,
        moveCount: 0,
        hint: null,
        positions: [{ fen: resp.fen, san: null, feedback: null, evalCp: null }],
        viewIndex: null,
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
      if (movePendingRef.current) return;
      movePendingRef.current = true;

      try {
      // Capture the index this user move will occupy in positions[]
      const userMovePositionIdx = session.positions.length;

      // Compute SAN and optimistic FEN before any state update
      setSession((s) => (s ? { ...s, hint: null } : s));
      const chess = new Chess(session.fen);
      const from = uciMove.slice(0, 2);
      const to = uciMove.slice(2, 4);
      const promotion = uciMove.length === 5 ? uciMove[4] : undefined;
      const moveResult = chess.move({ from, to, promotion });
      const playedSan = moveResult?.san ?? uciMove;
      const optimisticFen = chess.fen();
      setSession((s) => (s ? { ...s, fen: optimisticFen } : s));

      const resp = await sendMove(session.sessionId, uciMove);
      const newScore =
        resp.result === "correct" ? session.score + 1 : session.score;
      const newMoveCount = session.moveCount + 1;
      const mate = terminalFeedback(resp.fen, session.userColor);

      const isMistakeOrBlunder = resp.result === "mistake" || resp.result === "blunder";
      const newPosition: PositionEntry = {
        fen: resp.fen,
        san: playedSan,
        feedback: resp.feedback,
        evalCp: null,
      };

      setSession((s) =>
        s
          ? {
              ...s,
              fen: resp.fen,
              feedback: mate ?? resp.feedback,
              debugMsg: resp.debug_msg ?? null,
              llmDebugMsg: null,
              explanationPending: !mate && isMistakeOrBlunder,
              score: newScore,
              moveCount: newMoveCount,
              positions: [...s.positions, newPosition],
              viewIndex: null,
              ...(mate ? { status: "complete" as const } : {}),
            }
          : s
      );

      if (mate) {
        // game over — don't trigger opponent move
      } else if (resp.result === "correct") {
        await triggerOpponentMove(session.sessionId, newScore, newMoveCount);
      } else {
        setSession((s) => (s ? { ...s, status: "awaiting_decision" } : s));
      }

      if (!mate && isMistakeOrBlunder) {
        const capturedSessionId = session.sessionId;
        if (abortExplanationPollRef.current) abortExplanationPollRef.current.aborted = true;
        const signal = { aborted: false };
        abortExplanationPollRef.current = signal;
        fetchExplanationOnce(
          capturedSessionId,
          signal,
          (explanation, llmDebug) => {
            setSession((s) => {
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
            setSession((s) => {
              if (!s || s.sessionId !== capturedSessionId) return s;
              return { ...s, explanationPending: false };
            });
          },
        );
      }
      } finally {
        movePendingRef.current = false;
      }
    },
    [session, triggerOpponentMove]
  );

  const retry = useCallback(async () => {
    if (!session) return;
    const { fen } = await undoMove(session.sessionId);
    setSession((s) =>
      s ? {
        ...s,
        fen,
        status: "playing",
        feedback: null,
        positions: s.positions.slice(0, -1), // remove the off-tree move
        viewIndex: null,
      } : s
    );
  }, [session]);

  const continuePlay = useCallback(async () => {
    if (!session) return;
    setSession((s) => (s ? { ...s, feedback: null, viewIndex: null } : s));
    await triggerOpponentMove(session.sessionId, session.score, session.moveCount);
  }, [session, triggerOpponentMove]);

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

  const goToIndex = useCallback((i: number | null) => {
    setSession((s) => {
      if (!s) return s;
      // Last position == current position; treat as live so the board re-enables
      const normalized = i !== null && i >= s.positions.length - 1 ? null : i;
      return { ...s, viewIndex: normalized };
    });
  }, []);

  const updatePositionEval = useCallback((fen: string, cp: number) => {
    setSession((s) => {
      if (!s) return s;
      const positions = s.positions.map((p) =>
        p.fen === fen && p.evalCp === null ? { ...p, evalCp: cp } : p
      );
      return { ...s, positions };
    });
  }, []);

  return {
    session,
    begin,
    move,
    retry,
    continuePlay,
    restart,
    requestHint,
    clearSession,
    goToIndex,
    updatePositionEval,
  };
}
