import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach } from "vitest";
import { OpeningSelector } from "./OpeningSelector";
import * as openingsApi from "../../api/openings";
import type { OpeningSummary } from "../../types";

const MOCK_OPENINGS: OpeningSummary[] = [
  {
    id: "italian",
    name: "Italian Game",
    color: "white",
    variations: [
      { id: "giuoco_piano", name: "Giuoco Piano" },
      { id: "evans_gambit", name: "Evans Gambit" },
    ],
  },
  {
    id: "sicilian",
    name: "Sicilian Defence",
    color: "black",
    variations: [{ id: "najdorf", name: "Najdorf" }],
  },
];

beforeEach(() => {
  vi.spyOn(openingsApi, "fetchOpenings").mockResolvedValue(MOCK_OPENINGS);
});

describe("OpeningSelector", () => {
  it("renders the title", async () => {
    render(<OpeningSelector onStart={vi.fn()} />);
    await waitFor(() => screen.getByText("Italian Game"));
    expect(screen.getByText("Repertoire")).toBeInTheDocument();
  });

  it("loads and displays openings", async () => {
    render(<OpeningSelector onStart={vi.fn()} />);
    await waitFor(() => screen.getByText("Italian Game"));
    expect(screen.getByText("Sicilian Defence")).toBeInTheDocument();
  });

  it("Start button is disabled until opening and variation are selected", async () => {
    render(<OpeningSelector onStart={vi.fn()} />);
    await waitFor(() => screen.getByText("Italian Game"));
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("shows variations after selecting an opening", async () => {
    const user = userEvent.setup();
    render(<OpeningSelector onStart={vi.fn()} />);
    await waitFor(() => screen.getByText("Italian Game"));

    await user.click(screen.getByRole("button", { name: /Italian Game/i }));
    expect(screen.getByText("Giuoco Piano")).toBeInTheDocument();
    expect(screen.getByText("Evans Gambit")).toBeInTheDocument();
  });

  it("Start button enables once opening and variation are both selected", async () => {
    const user = userEvent.setup();
    render(<OpeningSelector onStart={vi.fn()} />);
    await waitFor(() => screen.getByText("Italian Game"));

    await user.click(screen.getByRole("button", { name: /Italian Game/i }));
    await user.click(screen.getByRole("button", { name: "Giuoco Piano" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("calls onStart with correct params including color from opening", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<OpeningSelector onStart={onStart} />);
    await waitFor(() => screen.getByText("Italian Game"));

    await user.click(screen.getByRole("button", { name: /Italian Game/i }));
    await user.click(screen.getByRole("button", { name: "Giuoco Piano" }));
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(onStart).toHaveBeenCalledWith({
      opening_id: "italian",
      variation_id: "giuoco_piano",
      color: "white",
      mode: "study",
      skill_level: "intermediate",
    });
  });

  it("selecting a different opening resets variation selection", async () => {
    const user = userEvent.setup();
    render(<OpeningSelector onStart={vi.fn()} />);
    await waitFor(() => screen.getByText("Italian Game"));

    await user.click(screen.getByRole("button", { name: /Italian Game/i }));
    await user.click(screen.getByRole("button", { name: "Giuoco Piano" }));
    await user.click(screen.getByRole("button", { name: /Sicilian/i }));

    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("shows error message when API fails", async () => {
    vi.spyOn(openingsApi, "fetchOpenings").mockRejectedValue(new Error("Network error"));
    render(<OpeningSelector onStart={vi.fn()} />);
    await waitFor(() =>
      screen.getByText("Failed to load openings.")
    );
  });
});
