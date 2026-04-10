import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { Board, resolveMove, resolvePreMove } from "./Board";
import { useState } from "react";

// react-chessboard uses ResizeObserver which jsdom doesn't provide
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// After 1.e4 — black to move
const AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

// ---------------------------------------------------------------------------
// resolveMove — unit tests (no React)
// ---------------------------------------------------------------------------

describe("resolveMove", () => {
  it("returns UCI for a legal pawn move", () => {
    expect(resolveMove(STARTING_FEN, "e2", "e4")).toBe("e2e4");
  });

  it("returns null for an illegal move", () => {
    expect(resolveMove(STARTING_FEN, "e2", "e5")).toBeNull();
  });

  it("returns null when moving opponent's piece", () => {
    expect(resolveMove(STARTING_FEN, "e7", "e5")).toBeNull();
  });

  it("appends promotion piece for pawn promotion", () => {
    // White pawn on e7, about to promote
    const fen = "8/4P3/8/8/8/8/8/4K2k w - - 0 1";
    const uci = resolveMove(fen, "e7", "e8");
    expect(uci).toBe("e7e8q");
  });

  it("resolves king-onto-own-rook as castling (kingside)", () => {
    // White has kingside castling rights, king on e1, rook on h1
    const fen = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
    expect(resolveMove(fen, "e1", "h1")).toBe("e1g1");
  });

  it("resolves king-onto-own-rook as castling (queenside)", () => {
    const fen = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
    expect(resolveMove(fen, "e1", "a1")).toBe("e1c1");
  });

  it("returns null if king drags onto rook but castling not available", () => {
    // Castling rights stripped
    const fen = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w - - 0 1";
    expect(resolveMove(fen, "e1", "h1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolvePreMove — validates moves as if it were the user's turn
// ---------------------------------------------------------------------------

describe("resolvePreMove", () => {
  // STARTING_FEN is white to move; pre-move validates from black's perspective
  // (i.e. if it's white's turn on board, user is black and wants to pre-move)

  it("accepts a legal black pre-move when board shows white to move", () => {
    // Black wants to pre-move e7e5 — legal for black
    expect(resolvePreMove(STARTING_FEN, "e7", "e5")).toBe("e7e5");
  });

  it("rejects moving a white piece when it's black's pre-move turn", () => {
    // Black can't pre-move a white pawn
    expect(resolvePreMove(STARTING_FEN, "e2", "e4")).toBeNull();
  });

  it("rejects an illegal king move (king cannot teleport 4 squares)", () => {
    // Black king on e8, trying to move to e4 — illegal
    expect(resolvePreMove(STARTING_FEN, "e8", "e4")).toBeNull();
  });

  it("accepts a legal white pre-move when board shows black to move", () => {
    // After 1.e4 (black to move), white wants to pre-move d2d4
    expect(resolvePreMove(AFTER_E4_FEN, "d2", "d4")).toBe("d2d4");
  });

  it("rejects a white piece pre-move that is not legal", () => {
    // White king trying to jump to e5 from e1 — illegal
    expect(resolvePreMove(AFTER_E4_FEN, "e1", "e5")).toBeNull();
  });

  it("returns null for a completely off-board move", () => {
    expect(resolvePreMove(STARTING_FEN, "a1", "a9" as string)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pre-move component integration tests
// ---------------------------------------------------------------------------

describe("Pre-move (component)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  interface WrapperProps {
    onMove: ReturnType<typeof vi.fn>;
    initialDisabled?: boolean;
    initialAllowPreMove?: boolean;
  }

  // Renders a Board with externally-controllable disabled + allowPreMove props,
  // plus buttons to simulate the opponent-move transition.
  function Wrapper({ onMove, initialDisabled = false, initialAllowPreMove = false }: WrapperProps) {
    const [disabled, setDisabled] = useState(initialDisabled);
    const [allowPreMove, setAllowPreMove] = useState(initialAllowPreMove);

    return (
      <>
        {/* Simulate opponent finishing their move: allowPreMove + disabled both drop to false */}
        <button data-testid="opponent-moves" onClick={() => {
          setDisabled(false);
          setAllowPreMove(false);
        }} />
        <button data-testid="enable" onClick={() => setDisabled(false)} />
        <Board
          fen={STARTING_FEN}
          orientation="white"
          onMove={onMove}
          disabled={disabled}
          allowPreMove={allowPreMove}
        />
      </>
    );
  }

  it("does not call onMove when allowPreMove transitions false with no pre-move queued", () => {
    const onMove = vi.fn();
    // Board starts disabled + allowPreMove (opponent thinking), no pre-move queued
    const { getByTestId } = render(
      <Wrapper onMove={onMove} initialDisabled={true} initialAllowPreMove={true} />
    );

    act(() => { getByTestId("opponent-moves").click(); });
    act(() => { vi.runAllTimers(); });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does not fire when allowPreMove goes false but disabled stays true", () => {
    const onMove = vi.fn();
    const { getByTestId } = render(
      <Wrapper onMove={onMove} initialDisabled={true} initialAllowPreMove={true} />
    );
    // Board becomes not-pre-movable but stays disabled (e.g. awaiting_decision)
    act(() => { getByTestId("enable").click(); });
    act(() => { vi.runAllTimers(); });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("resolveMove rejects illegal pre-move and returns null", () => {
    // A pre-move that becomes illegal after opponent moves should not fire
    expect(resolveMove(STARTING_FEN, "e2", "e5")).toBeNull();
  });

  it("resolveMove accepts a legal move in a mid-game position", () => {
    // After 1.e4 it's black's turn — black can play e7e5
    expect(resolveMove(AFTER_E4_FEN, "e7", "e5")).toBe("e7e5");
  });
});
