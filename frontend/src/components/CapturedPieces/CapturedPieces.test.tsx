import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { computeCaptured, CapturedPieces } from "./CapturedPieces";

// react-chessboard uses ResizeObserver which jsdom doesn't provide
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ---------------------------------------------------------------------------
// computeCaptured — pure function unit tests
// ---------------------------------------------------------------------------

describe("computeCaptured", () => {
  it("starting position has no captures", () => {
    const { capturedByWhite, capturedByBlack, whiteAdv } = computeCaptured(STARTING_FEN);
    expect(capturedByWhite).toHaveLength(0);
    expect(capturedByBlack).toHaveLength(0);
    expect(whiteAdv).toBe(0);
  });

  it("detects a missing black pawn as captured by white", () => {
    // Remove one black pawn from e7
    const fen = "rnbqkbnr/pppp1ppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const { capturedByWhite, capturedByBlack } = computeCaptured(fen);
    expect(capturedByWhite).toEqual(["p"]);
    expect(capturedByBlack).toHaveLength(0);
  });

  it("detects a missing white piece as captured by black", () => {
    // Remove white queen
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1";
    const { capturedByWhite, capturedByBlack } = computeCaptured(fen);
    expect(capturedByBlack).toContain("Q");
    expect(capturedByWhite).toHaveLength(0);
  });

  it("calculates material advantage correctly", () => {
    // White captured black queen (9), black captured nothing → whiteAdv = 9
    const fen = "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const { whiteAdv } = computeCaptured(fen);
    expect(whiteAdv).toBe(9);
  });

  it("negative advantage when black is ahead", () => {
    // Black captured white queen (9) → whiteAdv = -9
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1";
    const { whiteAdv } = computeCaptured(fen);
    expect(whiteAdv).toBe(-9);
  });

  it("sorts captured pieces by value descending", () => {
    // White captured black queen + rook + pawn
    const fen = "rnb1kb1r/p1pppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const { capturedByWhite } = computeCaptured(fen);
    const values: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };
    for (let i = 1; i < capturedByWhite.length; i++) {
      expect(values[capturedByWhite[i - 1]] ?? 0).toBeGreaterThanOrEqual(values[capturedByWhite[i]] ?? 0);
    }
  });

  it("handles multiple captures of the same piece type", () => {
    // Remove three black pawns
    const fen = "rnbqkbnr/5ppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const { capturedByWhite } = computeCaptured(fen);
    expect(capturedByWhite.filter((p) => p === "p")).toHaveLength(5);
  });

  it("equal captures → zero advantage", () => {
    // Both sides missing a rook
    const fen = "rnbqkbn1/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kq - 0 1";
    const { whiteAdv } = computeCaptured(fen);
    expect(whiteAdv).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CapturedPieces component — render tests
// ---------------------------------------------------------------------------

describe("CapturedPieces", () => {
  it("renders without crashing on starting position", () => {
    render(<CapturedPieces fen={STARTING_FEN} color="white" />);
  });

  it("shows material advantage badge when ahead", () => {
    // White captured black queen → white is +9
    const fen = "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    render(<CapturedPieces fen={fen} color="white" />);
    expect(screen.getByText("+9")).toBeInTheDocument();
  });

  it("does not show advantage badge on the losing side", () => {
    // White captured black queen → black is NOT +
    const fen = "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    render(<CapturedPieces fen={fen} color="black" />);
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it("shows no badge when material is equal", () => {
    render(<CapturedPieces fen={STARTING_FEN} color="white" />);
    expect(screen.queryByText(/^\+/)).toBeNull();
  });
});
