import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Feedback } from "./Feedback";
import type { Feedback as FeedbackType } from "../../types";

const noop = vi.fn();

const defaultProps = {
  awaitingDecision: false,
  notationMode: "notation" as const,
  onRetry: noop,
  onContinue: noop,
  onRestart: noop,
};

const makeFeedback = (
  quality: FeedbackType["quality"],
  explanation = "Test explanation."
): FeedbackType => ({
  quality,
  explanation,
  centipawn_loss: null,
  lines: null,
});

describe("Feedback", () => {
  it("renders nothing when no feedback", () => {
    const { container } = render(
      <Feedback {...defaultProps} feedback={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows correct label and explanation", () => {
    render(
      <Feedback
        {...defaultProps}
        feedback={makeFeedback("correct", "Great move!")}
      />
    );
    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(screen.getByText("Great move!")).toBeInTheDocument();
  });

  it("shows blunder label", () => {
    render(<Feedback {...defaultProps} feedback={makeFeedback("blunder")} />);
    expect(screen.getByText("Blunder")).toBeInTheDocument();
  });

  it("shows Retry, Continue, Restart buttons when awaiting decision", () => {
    render(
      <Feedback
        {...defaultProps}
        feedback={makeFeedback("blunder")}
        awaitingDecision={true}
      />
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart" })).toBeInTheDocument();
  });

  it("hides action buttons when not awaiting decision", () => {
    render(
      <Feedback
        {...defaultProps}
        feedback={makeFeedback("mistake")}
        awaitingDecision={false}
      />
    );
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("calls onRetry when Retry is clicked", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <Feedback
        {...defaultProps}
        feedback={makeFeedback("mistake")}
        awaitingDecision={true}
        onRetry={onRetry}
      />
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("calls onContinue when Continue is clicked", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(
      <Feedback
        {...defaultProps}
        feedback={makeFeedback("mistake")}
        awaitingDecision={true}
        onContinue={onContinue}
      />
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
