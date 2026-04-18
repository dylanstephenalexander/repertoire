import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionMoveList } from "./SessionMoveList";
import type { PositionEntry } from "../../types";

// jsdom doesn't implement scrollIntoView
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function makePosition(san: string | null, quality?: string): PositionEntry {
  return {
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    san,
    feedback: quality ? { quality, explanation: "", centipawn_loss: null, lines: null } : null,
    evalCp: null,
  };
}

// starting position (san=null) + 4 half-moves
const POSITIONS: PositionEntry[] = [
  makePosition(null),
  makePosition("e4"),
  makePosition("e5"),
  makePosition("Nf3"),
  makePosition("Nc6"),
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("SessionMoveList rendering", () => {
  it("renders an empty move list when only the starting position exists", () => {
    const { container } = render(
      <SessionMoveList positions={[makePosition(null)]} viewIndex={null} onSelect={vi.fn()} />
    );
    // Component always renders — no moves shown, but container is present
    expect(container.firstChild).not.toBeNull();
    expect(screen.queryByText("1.")).toBeNull();
  });

  it("renders move numbers and SAN notation", () => {
    render(<SessionMoveList positions={POSITIONS} viewIndex={null} onSelect={vi.fn()} />);
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("e4")).toBeInTheDocument();
    expect(screen.getByText("e5")).toBeInTheDocument();
    expect(screen.getByText("2.")).toBeInTheDocument();
    expect(screen.getByText("Nf3")).toBeInTheDocument();
    expect(screen.getByText("Nc6")).toBeInTheDocument();
  });

  it("renders quality badge for mistakes", () => {
    const positions = [makePosition(null), makePosition("e4", "mistake")];
    render(<SessionMoveList positions={positions} viewIndex={null} onSelect={vi.fn()} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders quality badge for blunders", () => {
    const positions = [makePosition(null), makePosition("e4", "blunder")];
    render(<SessionMoveList positions={positions} viewIndex={null} onSelect={vi.fn()} />);
    expect(screen.getByText("??")).toBeInTheDocument();
  });

  it("renders quality badge for alternatives", () => {
    const positions = [makePosition(null), makePosition("e4", "alternative")];
    render(<SessionMoveList positions={positions} viewIndex={null} onSelect={vi.fn()} />);
    expect(screen.getByText("!?")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Active highlight
// ---------------------------------------------------------------------------

describe("SessionMoveList active state", () => {
  it("highlights the last move when live (viewIndex=null)", () => {
    render(<SessionMoveList positions={POSITIONS} viewIndex={null} onSelect={vi.fn()} />);
    const nc6 = screen.getByText("Nc6");
    expect(nc6.getAttribute("data-active")).toBe("true");
  });

  it("highlights the correct historical move when viewIndex is set", () => {
    render(<SessionMoveList positions={POSITIONS} viewIndex={2} onSelect={vi.fn()} />);
    const e5 = screen.getByText("e5");
    expect(e5.getAttribute("data-active")).toBe("true");
    const nc6 = screen.getByText("Nc6");
    expect(nc6.getAttribute("data-active")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Click interactions (move cells only — nav buttons live in App.tsx sidebar)
// ---------------------------------------------------------------------------

describe("SessionMoveList click interactions", () => {
  it("clicking a historical move calls onSelect with its index", async () => {
    const onSelect = vi.fn();
    render(<SessionMoveList positions={POSITIONS} viewIndex={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("e4"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("clicking the live (last) move while in live mode calls onSelect(null)", async () => {
    const onSelect = vi.fn();
    render(<SessionMoveList positions={POSITIONS} viewIndex={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("Nc6"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
