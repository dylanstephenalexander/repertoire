import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChaos, _setThinkingDelayForTest } from "./useChaos";

beforeEach(() => { _setThinkingDelayForTest(0); });


// ---------------------------------------------------------------------------
// Mock API layer
// ---------------------------------------------------------------------------

vi.mock("../api/chaos", () => ({
  fetchEngineStatus: vi.fn(),
  startChaos: vi.fn(),
  sendChaosMove: vi.fn(),
  fetchChaosOpponentMove: vi.fn(),
  fetchChaosExplanation: vi.fn().mockResolvedValue({ explanation: null, llm_debug: null }),
}));

import * as chaosApi from "../api/chaos";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E5_FEN = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const DEFAULT_PARAMS = {
  color: "white" as const,
  elo_band: 1500,
};

const GOOD_MOVE_RESP = {
  fen: AFTER_E4_FEN,
  feedback: null,
  opening_name: null,
  in_theory: false,
  debug_msg: null,
};

const OPPONENT_MOVE_RESP_E5 = {
  uci_move: "e7e5",
  fen: AFTER_E5_FEN,
  opening_name: null,
  in_theory: false,
  opponent_move_time: null,
  opponent_engine: null,
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
// checkEngineStatus
// ---------------------------------------------------------------------------

describe("checkEngineStatus", () => {
  it("populates engineStatus from API response", async () => {
    vi.mocked(chaosApi.fetchEngineStatus).mockResolvedValue({
      lc0: true,
      maia_models: [1100, 1200, 1300],
    });

    const { result } = renderHook(() => useChaos());
    await act(async () => { await result.current.checkEngineStatus(); });

    expect(result.current.engineStatus?.lc0).toBe(true);
    expect(result.current.engineStatus?.maiaModels).toEqual([1100, 1200, 1300]);
  });

  it("sets lc0: false on fetch error", async () => {
    vi.mocked(chaosApi.fetchEngineStatus).mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useChaos());
    await act(async () => { await result.current.checkEngineStatus(); });

    expect(result.current.engineStatus?.lc0).toBe(false);
    expect(result.current.engineStatus?.maiaModels).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// beginChaos
// ---------------------------------------------------------------------------

describe("beginChaos", () => {
  it("starts session with playing status for white", async () => {
    vi.mocked(chaosApi.startChaos).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      user_color: "white",
    });

    const { result } = renderHook(() => useChaos());
    await act(async () => { await result.current.beginChaos(DEFAULT_PARAMS); });

    expect(result.current.chaosSession?.status).toBe("playing");
    expect(result.current.chaosSession?.userColor).toBe("white");
    expect(result.current.chaosSession?.feedbackEnabled).toBe(true);
  });

  it("feedback is enabled by default", async () => {
    vi.mocked(chaosApi.startChaos).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      user_color: "white",
    });

    const { result } = renderHook(() => useChaos());
    await act(async () => { await result.current.beginChaos(DEFAULT_PARAMS); });

    expect(result.current.chaosSession?.feedbackEnabled).toBe(true);
  });

  it("triggers opponent move when playing as black", async () => {
    vi.mocked(chaosApi.startChaos).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      user_color: "black",
    });
    vi.mocked(chaosApi.fetchChaosOpponentMove).mockResolvedValue({
      uci_move: "e2e4",
      fen: AFTER_E4_FEN,
      opening_name: null,
      in_theory: false,
      opponent_move_time: null,
      opponent_engine: null,
    });

    const { result } = renderHook(() => useChaos());
    act(() => { result.current.beginChaos({ ...DEFAULT_PARAMS, color: "black" }); });

    await waitFor(
      () => expect(chaosApi.fetchChaosOpponentMove).toHaveBeenCalledWith("abc"),
      { timeout: 2500 },
    );
    await waitFor(
      () => expect(result.current.chaosSession?.fen).toBe(AFTER_E4_FEN),
      { timeout: 2500 },
    );
  });

  it("does NOT trigger opponent move when playing as white", async () => {
    vi.mocked(chaosApi.startChaos).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      user_color: "white",
    });

    const { result } = renderHook(() => useChaos());
    await act(async () => { await result.current.beginChaos(DEFAULT_PARAMS); });

    expect(chaosApi.fetchChaosOpponentMove).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// chaosMove
// ---------------------------------------------------------------------------

describe("chaosMove", () => {
  async function startWhiteSession() {
    vi.mocked(chaosApi.startChaos).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      user_color: "white",
    });
    const hook = renderHook(() => useChaos());
    await act(async () => { await hook.result.current.beginChaos(DEFAULT_PARAMS); });
    return hook;
  }

  it("applies optimistic FEN immediately", async () => {
    const { result } = await startWhiteSession();
    vi.mocked(chaosApi.sendChaosMove).mockReturnValue(new Promise(() => {}));

    act(() => { result.current.chaosMove("e2e4"); });
    expect(result.current.chaosSession?.fen).not.toBe(START_FEN);
  });

  it("updates fen and clears feedback after confirmed move", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(chaosApi.sendChaosMove).mockResolvedValue(GOOD_MOVE_RESP);
    vi.mocked(chaosApi.fetchChaosOpponentMove).mockResolvedValue(OPPONENT_MOVE_RESP_E5);

    await act(async () => { await result.current.chaosMove("e2e4"); });

    await waitFor(
      () => expect(result.current.chaosSession?.fen).toBe(AFTER_E5_FEN),
      { timeout: 2500 },
    );
    expect(result.current.chaosSession?.feedback).toBeNull();
  });

  it("stores feedback from move response before opponent moves", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(chaosApi.sendChaosMove).mockResolvedValue({
      ...GOOD_MOVE_RESP,
      feedback: MISTAKE_FEEDBACK,
    });
    // Opponent move never resolves — lets us assert feedback mid-flight
    vi.mocked(chaosApi.fetchChaosOpponentMove).mockReturnValue(new Promise(() => {}));

    act(() => { result.current.chaosMove("e2e4"); });

    await waitFor(
      () => expect(result.current.chaosSession?.feedback?.quality).toBe("mistake"),
      { timeout: 2500 },
    );
  });

  it("stores opening name when returned", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(chaosApi.sendChaosMove).mockResolvedValue({
      ...GOOD_MOVE_RESP,
      opening_name: "King's Pawn Game",
      in_theory: true,
    });
    vi.mocked(chaosApi.fetchChaosOpponentMove).mockResolvedValue({
      ...OPPONENT_MOVE_RESP_E5,
      opening_name: "King's Pawn Game",
      in_theory: true,
    });

    await act(async () => { await result.current.chaosMove("e2e4"); });

    await waitFor(
      () => expect(result.current.chaosSession?.openingName).toBe("King's Pawn Game"),
      { timeout: 2500 },
    );
  });

  it("ignores move() when not in playing status", async () => {
    const { result } = await startWhiteSession();
    act(() => { result.current.resign(); });

    vi.clearAllMocks();
    await act(async () => { await result.current.chaosMove("e2e4"); });

    expect(chaosApi.sendChaosMove).not.toHaveBeenCalled();
  });

  it("passes feedbackEnabled to API", async () => {
    const { result } = await startWhiteSession();

    vi.mocked(chaosApi.sendChaosMove).mockResolvedValue(GOOD_MOVE_RESP);
    vi.mocked(chaosApi.fetchChaosOpponentMove).mockResolvedValue(OPPONENT_MOVE_RESP_E5);

    await act(async () => { await result.current.chaosMove("e2e4"); });

    expect(chaosApi.sendChaosMove).toHaveBeenCalledWith("abc", "e2e4", true);
  });
});

// ---------------------------------------------------------------------------
// toggleFeedback
// ---------------------------------------------------------------------------

describe("toggleFeedback", () => {
  it("toggles feedbackEnabled off and on", async () => {
    vi.mocked(chaosApi.startChaos).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      user_color: "white",
    });

    const { result } = renderHook(() => useChaos());
    await act(async () => { await result.current.beginChaos(DEFAULT_PARAMS); });

    expect(result.current.chaosSession?.feedbackEnabled).toBe(true);

    act(() => { result.current.toggleFeedback(); });
    expect(result.current.chaosSession?.feedbackEnabled).toBe(false);

    act(() => { result.current.toggleFeedback(); });
    expect(result.current.chaosSession?.feedbackEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resign
// ---------------------------------------------------------------------------

describe("resign", () => {
  it("sets status to complete", async () => {
    vi.mocked(chaosApi.startChaos).mockResolvedValue({
      session_id: "abc",
      fen: START_FEN,
      user_color: "white",
    });

    const { result } = renderHook(() => useChaos());
    await act(async () => { await result.current.beginChaos(DEFAULT_PARAMS); });

    expect(result.current.chaosSession?.status).toBe("playing");

    act(() => { result.current.resign(); });
    expect(result.current.chaosSession?.status).toBe("complete");
  });
});
