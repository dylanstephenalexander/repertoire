import { render, screen } from "@testing-library/react";
import { Feedback } from "./Feedback";
import type { Feedback as FeedbackType } from "../../types";

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
  it("renders nothing visible when no feedback and not thinking", () => {
    const { container } = render(
      <Feedback feedback={null} isOpponentThinking={false} />
    );
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it("shows Thinking... when opponent is thinking", () => {
    render(<Feedback feedback={null} isOpponentThinking={true} />);
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("shows correct label and explanation", () => {
    render(
      <Feedback
        feedback={makeFeedback("correct", "Great move!")}
        isOpponentThinking={false}
      />
    );
    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(screen.getByText("Great move!")).toBeInTheDocument();
  });

  it("shows blunder label", () => {
    render(
      <Feedback feedback={makeFeedback("blunder")} isOpponentThinking={false} />
    );
    expect(screen.getByText("Blunder")).toBeInTheDocument();
  });

  it("thinking takes priority over existing feedback", () => {
    render(
      <Feedback
        feedback={makeFeedback("mistake")}
        isOpponentThinking={true}
      />
    );
    expect(screen.queryByText("Mistake")).not.toBeInTheDocument();
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });
});
