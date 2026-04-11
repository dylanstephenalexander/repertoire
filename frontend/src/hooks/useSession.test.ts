import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSession, _setThinkingDelayForTest } from "./useSession";

beforeEach(() => { _setThinkingDelayForTest(0); });


// ---------------------------------------------------------------------------
// Mock API layer
// ---------------------------------------------------------------------------

vi.mock("../api/session", () => ({
  startSession: vi.fn(),
  sendMove: vi.fn(),
  fetchOpponentMove: vi.fn(),
  undoMove: vi.fn(),
  fetchHint: vi.fn(),
  fetchExplanation: vi.fn().mockResolvedValue({ explanation: null, llm_debug: null }),
}));

import * as sessionApi from "../api/session";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E5_FEN = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const DEFAULT_START_PARAMS = {
  opening_id: "italian",
  variation_id: "giuoco_piano",
  color: "white" as const,
  mode: "study" as const,
};

const CORRECT_FEEDBACK = {
  quality: "correct" as const,
  explanation: "Good move!",
  centipawn_loss: null,
  lines: null,
};

const MISTAKE_FEEDBACK = {
  quality: "mistake" as const,
  explanation: "That loses material.",
  centipawn_loss: 80,
  lines: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// begin()
// ---------------------------------------------------------------------------

describe("begin", () => {
  it("starts as idle, transitions to playing after begin()", async () => {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });

    const { result } = renderHook(() => useSession());
    expect(result.current.session).toBeNull();

    await act(async () => {
      await result.current.begin(DEFAULT_START_PARAMS);
    });

    expect(result.current.session?.status).toBe("playing");
    expect(result.current.session?.fen).toBe(START_FEN);
    expect(result.current.session?.score).toBe(0);
  });

  it("does NOT trigger opponent move when playing as white", async () => {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });

    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.begin(DEFAULT_START_PARAMS);
    });

    expect(sessionApi.fetchOpponentMove).not.toHaveBeenCalled();
    expect(result.current.session?.status).toBe("playing");
  });

  it("triggers opponent move when playing as black", async () => {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    vi.mocked(sessionApi.fetchOpponentMove).mockResolvedValue({
      uci_move: "e2e4",
      fen: AFTER_E4_FEN,
      line_complete: false,
    });

    const { result } = renderHook(() => useSession());

    // begin() triggers triggerOpponentMove which has a 1s delay — don't await
    act(() => { result.current.begin({ ...DEFAULT_START_PARAMS, color: "black" }); });

    // Wait for opponent move to complete (>1s real timer + fetch)
    await waitFor(
      () => expect(sessionApi.fetchOpponentMove).toHaveBeenCalledWith("abc"),
      { timeout: 2500 },
    );
    await waitFor(
      () => expect(result.current.session?.fen).toBe(AFTER_E4_FEN),
      { timeout: 2500 },
    );
  });
});

// ---------------------------------------------------------------------------
// move()
// ---------------------------------------------------------------------------

describe("move", () => {
  async function startWhiteSession() {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    const hook = renderHook(() => useSession());
    await act(async () => {
      await hook.result.current.begin(DEFAULT_START_PARAMS);
    });
    return hook;
  }

  it("applies optimistic FEN update immediately", async () => {
    const { result } = await startWhiteSession();

    // Don't await the full move — check FEN update is optimistic
    vi.mocked(sessionApi.sendMove).mockReturnValue(new Promise(() => {})); // never resolves
    act(() => { result.current.move("e2e4"); });

    expect(result.current.session?.fen).not.toBe(START_FEN);
  });

  it("increments score on correct move", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "correct",
      feedback: CORRECT_FEEDBACK,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });
    vi.mocked(sessionApi.fetchOpponentMove).mockResolvedValue({
      uci_move: "e7e5",
      fen: AFTER_E5_FEN,
      line_complete: false,
    });

    await act(async () => { await result.current.move("e2e4"); });

    await waitFor(
      () => expect(result.current.session?.score).toBe(1),
      { timeout: 2500 },
    );
  });

  it("does not increment score on mistake", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "mistake",
      feedback: MISTAKE_FEEDBACK,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });

    await act(async () => { await result.current.move("d2d4"); });

    expect(result.current.session?.score).toBe(0);
    expect(result.current.session?.status).toBe("awaiting_decision");
  });

  it("sets feedback and awaiting_decision on non-correct move", async () => {
    const { result } = await startWhiteSession();

    const blunderFeedback = { ...MISTAKE_FEEDBACK, quality: "blunder" as const };
    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "blunder",
      feedback: blunderFeedback,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });

    await act(async () => { await result.current.move("d2d4"); });

    expect(result.current.session?.status).toBe("awaiting_decision");
    expect(result.current.session?.feedback?.quality).toBe("blunder");
  });

  it("ignores move() calls when not in playing status", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "mistake",
      feedback: MISTAKE_FEEDBACK,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });

    await act(async () => { await result.current.move("d2d4"); });
    // Now in awaiting_decision — a second move should be ignored
    vi.clearAllMocks();
    await act(async () => { await result.current.move("e2e4"); });

    expect(sessionApi.sendMove).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// retry()
// ---------------------------------------------------------------------------

describe("retry", () => {
  it("calls undoMove and restores fen + playing status", async () => {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "mistake",
      feedback: MISTAKE_FEEDBACK,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });
    vi.mocked(sessionApi.undoMove).mockResolvedValue({ fen: START_FEN });

    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.begin(DEFAULT_START_PARAMS); });
    await act(async () => { await result.current.move("d2d4"); });

    expect(result.current.session?.status).toBe("awaiting_decision");

    await act(async () => { await result.current.retry(); });

    expect(sessionApi.undoMove).toHaveBeenCalledWith("abc");
    expect(result.current.session?.fen).toBe(START_FEN);
    expect(result.current.session?.status).toBe("playing");
    expect(result.current.session?.feedback).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// continuePlay()
// ---------------------------------------------------------------------------

describe("continuePlay", () => {
  it("clears feedback and triggers opponent move", async () => {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "mistake",
      feedback: MISTAKE_FEEDBACK,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });
    vi.mocked(sessionApi.fetchOpponentMove).mockResolvedValue({
      uci_move: "e7e5",
      fen: AFTER_E5_FEN,
      line_complete: false,
    });

    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.begin(DEFAULT_START_PARAMS); });
    await act(async () => { await result.current.move("d2d4"); });

    // Begin continuePlay — don't await (has 1s delay inside)
    act(() => { result.current.continuePlay(); });

    await waitFor(
      () => expect(sessionApi.fetchOpponentMove).toHaveBeenCalledWith("abc"),
      { timeout: 2500 },
    );
    await waitFor(
      () => expect(result.current.session?.fen).toBe(AFTER_E5_FEN),
      { timeout: 2500 },
    );
  });
});

// ---------------------------------------------------------------------------
// goToIndex — view navigation + normalization
// ---------------------------------------------------------------------------

describe("goToIndex", () => {
  async function startWithMoves() {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "correct",
      feedback: null,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });
    vi.mocked(sessionApi.fetchOpponentMove).mockResolvedValue({
      uci_move: "e7e5",
      fen: AFTER_E5_FEN,
      line_complete: false,
    });
    const hook = renderHook(() => useSession());
    await act(async () => { await hook.result.current.begin(DEFAULT_START_PARAMS); });
    await act(async () => { await hook.result.current.move("e2e4"); });
    await waitFor(() => expect(hook.result.current.session?.fen).toBe(AFTER_E5_FEN), { timeout: 2500 });
    return hook;
  }

  it("sets viewIndex to the given index", async () => {
    const { result } = await startWithMoves();
    act(() => { result.current.goToIndex(1); });
    expect(result.current.session?.viewIndex).toBe(1);
  });

  it("normalizes last-position index to null (live)", async () => {
    const { result } = await startWithMoves();
    // positions has 3 entries (start + e4 + e5), last index = 2
    const lastIdx = (result.current.session?.positions.length ?? 1) - 1;
    act(() => { result.current.goToIndex(lastIdx); });
    expect(result.current.session?.viewIndex).toBeNull();
  });

  it("goToIndex(null) sets viewIndex to null", async () => {
    const { result } = await startWithMoves();
    act(() => { result.current.goToIndex(1); });
    act(() => { result.current.goToIndex(null); });
    expect(result.current.session?.viewIndex).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updatePositionEval — only sets evalCp once per position
// ---------------------------------------------------------------------------

describe("updatePositionEval", () => {
  it("writes evalCp into the matching position", async () => {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.begin(DEFAULT_START_PARAMS); });

    act(() => { result.current.updatePositionEval(START_FEN, 30); });
    expect(result.current.session?.positions[0].evalCp).toBe(30);
  });

  it("does not overwrite an already-set evalCp", async () => {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.begin(DEFAULT_START_PARAMS); });

    act(() => { result.current.updatePositionEval(START_FEN, 30); });
    act(() => { result.current.updatePositionEval(START_FEN, 999); });
    // Second call should be ignored — null guard
    expect(result.current.session?.positions[0].evalCp).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// positions array accumulation
// ---------------------------------------------------------------------------

describe("positions array", () => {
  it("starts with one entry for the initial position", async () => {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.begin(DEFAULT_START_PARAMS); });
    expect(result.current.session?.positions).toHaveLength(1);
    expect(result.current.session?.positions[0].san).toBeNull();
  });

  it("appends an entry with san and fen after each move", async () => {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "correct",
      feedback: null,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });
    vi.mocked(sessionApi.fetchOpponentMove).mockResolvedValue({
      uci_move: "e7e5",
      fen: AFTER_E5_FEN,
      line_complete: false,
    });
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.begin(DEFAULT_START_PARAMS); });
    await act(async () => { await result.current.move("e2e4"); });
    await waitFor(() => expect(result.current.session?.positions).toHaveLength(3), { timeout: 2500 });

    expect(result.current.session?.positions[1].san).toBe("e4");
    expect(result.current.session?.positions[1].fen).toBe(AFTER_E4_FEN);
    expect(result.current.session?.positions[2].san).toBe("e5");
  });
});

// ---------------------------------------------------------------------------
// restart()
// ---------------------------------------------------------------------------

describe("restart", () => {
  it("re-calls startSession with the same params and resets score", async () => {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });

    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.begin(DEFAULT_START_PARAMS); });

    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "xyz",
      fen: START_FEN,
      to_move: "white",
    });

    await act(async () => { await result.current.restart(); });

    expect(sessionApi.startSession).toHaveBeenCalledTimes(2);
    expect(sessionApi.startSession).toHaveBeenLastCalledWith(DEFAULT_START_PARAMS);
    expect(result.current.session?.sessionId).toBe("xyz");
    expect(result.current.session?.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Draw detection
// ---------------------------------------------------------------------------

describe("draw detection", () => {
  async function startWhiteSession() {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    const hook = renderHook(() => useSession());
    await act(async () => { await hook.result.current.begin(DEFAULT_START_PARAMS); });
    return hook;
  }

  it("sets status complete and quality draw on stalemate FEN after user move", async () => {
    // Stalemate position: black king on a8, white queen on b6, white king on c6 — it's black to move but no legal moves
    // This FEN is stalemate for black (black to move, no legal moves, not in check)
    const STALEMATE_FEN = "k7/8/1QK5/8/8/8/8/8 b - - 0 1";
    const { result } = await startWhiteSession();

    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "correct",
      feedback: null,
      fen: STALEMATE_FEN,
      eval_cp: null,
      debug_msg: null,
    });

    await act(async () => { await result.current.move("e2e4"); });

    expect(result.current.session?.status).toBe("complete");
    expect(result.current.session?.feedback?.quality).toBe("draw");
    expect(result.current.session?.feedback?.explanation).toMatch(/stalemate/i);
  });

  it("sets status complete and quality checkmate on checkmate FEN", async () => {
    // Fool's mate — black wins
    const CHECKMATE_FEN = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    const { result } = await startWhiteSession();

    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "correct",
      feedback: null,
      fen: CHECKMATE_FEN,
      eval_cp: null,
      debug_msg: null,
    });

    await act(async () => { await result.current.move("e2e4"); });

    expect(result.current.session?.status).toBe("complete");
    expect(result.current.session?.feedback?.quality).toBe("checkmate");
  });
});

// ---------------------------------------------------------------------------
// LLM explanation — single long-poll request per mistake (no polling loop)
// ---------------------------------------------------------------------------

describe("LLM explanation request", () => {
  async function startWhiteSession() {
    vi.mocked(sessionApi.startSession).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      to_move: "white",
    });
    const hook = renderHook(() => useSession());
    await act(async () => { await hook.result.current.begin(DEFAULT_START_PARAMS); });
    return hook;
  }

  it("fires exactly one explanation request after a mistake", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "mistake",
      feedback: MISTAKE_FEEDBACK,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });
    let callCount = 0;
    vi.mocked(sessionApi.fetchExplanation).mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        explanation: "Knight is hanging.",
        llm_debug: "gemini-2.5-flash — OK\n\nKnight is hanging.",
      });
    });

    await act(async () => { await result.current.move("d2d4"); });

    await waitFor(
      () => expect(result.current.session?.llmDebugMsg).toContain("OK"),
      { timeout: 5000 },
    );
    expect(result.current.session?.explanationPending).toBe(false);
    // Critical: ONE request only — not the 8–12 loop that caused the rate limiting
    expect(callCount).toBe(1);
  }, 10000);

  it("sets explanationPending true while waiting, false when result arrives", async () => {
    const { result } = await startWhiteSession();

    let resolveExplanation!: (v: { explanation: string; llm_debug: string }) => void;
    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "mistake",
      feedback: MISTAKE_FEEDBACK,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });
    vi.mocked(sessionApi.fetchExplanation).mockReturnValue(
      new Promise((res) => { resolveExplanation = res as typeof resolveExplanation; })
    );

    act(() => { result.current.move("d2d4"); });

    await waitFor(() => expect(result.current.session?.explanationPending).toBe(true), { timeout: 2500 });

    act(() => {
      resolveExplanation({ explanation: "Blunder.", llm_debug: "gemini-2.5-flash — OK\n\nBlunder." });
    });

    await waitFor(() => expect(result.current.session?.explanationPending).toBe(false), { timeout: 2500 });
  });

  it("clears explanationPending when the backend returns null (timeout)", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "mistake",
      feedback: MISTAKE_FEEDBACK,
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });

    let callCount = 0;
    vi.mocked(sessionApi.fetchExplanation).mockImplementation(() => {
      callCount++;
      return Promise.resolve({ explanation: null, llm_debug: null });
    });

    await act(async () => { await result.current.move("d2d4"); });

    await waitFor(
      () => expect(result.current.session?.explanationPending).toBe(false),
      { timeout: 3000 },
    );
    // Single request even on timeout — no retry loop
    expect(callCount).toBe(1);
  });

  it("does not fetch an explanation for a correct move", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(sessionApi.sendMove).mockResolvedValue({
      result: "correct",
      feedback: { quality: "correct", explanation: "Good move!", centipawn_loss: null, lines: null },
      fen: AFTER_E4_FEN,
      eval_cp: null,
      debug_msg: null,
    });
    vi.mocked(sessionApi.fetchOpponentMove).mockResolvedValue({
      uci_move: "e7e5",
      fen: AFTER_E5_FEN,
      line_complete: false,
    });

    await act(async () => { await result.current.move("e2e4"); });
    await waitFor(() => expect(result.current.session?.fen).toBe(AFTER_E5_FEN), { timeout: 2500 });

    expect(sessionApi.fetchExplanation).not.toHaveBeenCalled();
  });

  it("concurrent move calls do not trigger duplicate API calls", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(sessionApi.sendMove).mockReturnValue(new Promise(() => {}));

    act(() => { result.current.move("e2e4"); });
    act(() => { result.current.move("e2e4"); });

    expect(sessionApi.sendMove).toHaveBeenCalledTimes(1);
  });
});
