import { useCallback, useRef, useState } from "react";
import { Chess } from "chess.js";
import { analyseGame, fetchGames } from "../api/review";
import type { FetchGamesParams } from "../api/review";
import type { GameSummary, MoveAnnotation, ReviewResponse } from "../types";

type ReviewPhase = "idle" | "fetching" | "selecting" | "analysing" | "reviewing";

export interface ReviewState {
  phase: ReviewPhase;
  games: GameSummary[];
  review: ReviewResponse | null;
  currentMoveIndex: number; // -1 = starting position, 0..n-1 = after that move
  error: string | null;
}

export interface UseReviewReturn {
  state: ReviewState;
  loadGames: (params: FetchGamesParams) => Promise<void>;
  analyse: (pgn: string) => Promise<void>;
  cancelAnalysis: () => void;
  goToMove: (index: number) => void;
  nextMove: () => void;
  prevMove: () => void;
  reset: () => void;
  /** FEN to display on the board at the current navigator position. */
  currentFen: string;
  /** Eval for the current position (white's perspective). Null at start. */
  currentEvalCp: number | null;
  /** Annotation for the move that was just played (null at start position). */
  currentAnnotation: MoveAnnotation | null;
}

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function fenAfterMove(annotation: MoveAnnotation): string {
  const chess = new Chess(annotation.fen_before);
  const from = annotation.move_uci.slice(0, 2);
  const to = annotation.move_uci.slice(2, 4);
  const promotion = annotation.move_uci.length === 5 ? annotation.move_uci[4] : undefined;
  chess.move({ from, to, promotion });
  return chess.fen();
}

const INITIAL_STATE: ReviewState = {
  phase: "idle",
  games: [],
  review: null,
  currentMoveIndex: -1,
  error: null,
};

export function useReview(): UseReviewReturn {
  const [state, setState] = useState<ReviewState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const loadGames = useCallback(async (params: FetchGamesParams) => {
    setState((s) => ({ ...s, phase: "fetching", error: null }));
    try {
      const games = await fetchGames(params);
      setState((s) => ({ ...s, phase: "selecting", games }));
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: "idle",
        error: err instanceof Error ? err.message : "Failed to fetch games",
      }));
    }
  }, []);

  const analyse = useCallback(async (pgn: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((s) => ({ ...s, phase: "analysing", error: null }));
    try {
      const review = await analyseGame(pgn, controller.signal);
      setState((s) => ({ ...s, phase: "reviewing", review, currentMoveIndex: -1 }));
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // cancelled — state already set by cancelAnalysis
      setState((s) => ({
        ...s,
        phase: "selecting",
        error: err instanceof Error ? err.message : "Analysis failed",
      }));
    }
  }, []);

  const cancelAnalysis = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, phase: "selecting", error: null }));
  }, []);

  const goToMove = useCallback((index: number) => {
    setState((s) => {
      if (!s.review) return s;
      const clamped = Math.max(-1, Math.min(index, s.review.moves.length - 1));
      return { ...s, currentMoveIndex: clamped };
    });
  }, []);

  const nextMove = useCallback(() => {
    setState((s) => {
      if (!s.review) return s;
      const next = Math.min(s.currentMoveIndex + 1, s.review.moves.length - 1);
      return { ...s, currentMoveIndex: next };
    });
  }, []);

  const prevMove = useCallback(() => {
    setState((s) => ({ ...s, currentMoveIndex: Math.max(-1, s.currentMoveIndex - 1) }));
  }, []);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  // Derive display values from state
  const moves = state.review?.moves ?? [];
  const idx = state.currentMoveIndex;

  const currentFen: string =
    idx < 0 ? STARTING_FEN : fenAfterMove(moves[idx]);

  const currentEvalCp: number | null =
    idx < 0 ? null : (moves[idx].eval_cp ?? null);

  const currentAnnotation: MoveAnnotation | null =
    idx < 0 ? null : moves[idx];

  return {
    state,
    loadGames,
    analyse,
    cancelAnalysis,
    goToMove,
    nextMove,
    prevMove,
    reset,
    currentFen,
    currentEvalCp,
    currentAnnotation,
  };
}
