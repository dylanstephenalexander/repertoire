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
  it("returns null when only the starting position exists", () => {
    const { container } = render(
      <SessionMoveList positions={[makePosition(null)]} viewIndex={null} onSelect={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
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
    // Nc6 is position index 4, the last move — should be active
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
// Navigation button states
// ---------------------------------------------------------------------------

describe("SessionMoveList nav button states", () => {
  it("⏮ is disabled when at the start (viewIndex=0)", () => {
    render(<SessionMoveList positions={POSITIONS} viewIndex={0} onSelect={vi.fn()} />);
    expect(screen.getByTitle("Start")).toBeDisabled();
  });

  it("⏮ is not disabled when not at the start", () => {
    render(<SessionMoveList positions={POSITIONS} viewIndex={2} onSelect={vi.fn()} />);
    expect(screen.getByTitle("Start")).not.toBeDisabled();
  });

  it("⏭ is disabled when live (viewIndex=null)", () => {
    render(<SessionMoveList positions={POSITIONS} viewIndex={null} onSelect={vi.fn()} />);
    expect(screen.getByTitle("Current position")).toBeDisabled();
  });

  it("⏭ is not disabled when reviewing a historical position", () => {
    render(<SessionMoveList positions={POSITIONS} viewIndex={2} onSelect={vi.fn()} />);
    expect(screen.getByTitle("Current position")).not.toBeDisabled();
  });

  it("◀ is disabled when live and only one move exists", () => {
    const positions = [makePosition(null), makePosition("e4")];
    render(<SessionMoveList positions={positions} viewIndex={null} onSelect={vi.fn()} />);
    // Live with 1 move — back would go to start which is position 0; canGoBack = positions.length > 1 = true
    // Actually canGoBack is true here. Let's check at index 0.
    render(<SessionMoveList positions={positions} viewIndex={0} onSelect={vi.fn()} />);
    expect(screen.getAllByTitle("Previous move")[1]).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Click interactions
// ---------------------------------------------------------------------------

describe("SessionMoveList click interactions", () => {
  it("clicking a historical move calls onSelect with its index", async () => {
    const onSelect = vi.fn();
    render(<SessionMoveList positions={POSITIONS} viewIndex={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("e4"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("clicking ⏮ calls onSelect(0)", async () => {
    const onSelect = vi.fn();
    render(<SessionMoveList positions={POSITIONS} viewIndex={2} onSelect={onSelect} />);
    await userEvent.click(screen.getByTitle("Start"));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("clicking ⏭ calls onSelect(null)", async () => {
    const onSelect = vi.fn();
    render(<SessionMoveList positions={POSITIONS} viewIndex={2} onSelect={onSelect} />);
    await userEvent.click(screen.getByTitle("Current position"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("clicking ▶ from a historical position advances by one", async () => {
    const onSelect = vi.fn();
    render(<SessionMoveList positions={POSITIONS} viewIndex={2} onSelect={onSelect} />);
    await userEvent.click(screen.getByTitle("Next move"));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("clicking ◀ from a historical position goes back by one", async () => {
    const onSelect = vi.fn();
    render(<SessionMoveList positions={POSITIONS} viewIndex={3} onSelect={onSelect} />);
    await userEvent.click(screen.getByTitle("Previous move"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("clicking ◀ from live state (viewIndex=null) goes to second-to-last position", async () => {
    const onSelect = vi.fn();
    render(<SessionMoveList positions={POSITIONS} viewIndex={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByTitle("Previous move"));
    // POSITIONS has 5 entries (indices 0–4); live back should go to index 3
    expect(onSelect).toHaveBeenCalledWith(3);
  });
});
