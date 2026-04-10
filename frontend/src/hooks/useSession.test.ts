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
