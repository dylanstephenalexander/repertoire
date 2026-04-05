import type { Feedback as FeedbackType } from "../../types";
import styles from "./Feedback.module.css";

interface FeedbackProps {
  feedback: FeedbackType | null;
  isOpponentThinking: boolean;
}

const QUALITY_LABELS: Record<FeedbackType["quality"], string> = {
  correct: "Correct",
  alternative: "Alternative",
  mistake: "Mistake",
  blunder: "Blunder",
};

export function Feedback({ feedback, isOpponentThinking }: FeedbackProps) {
  if (isOpponentThinking) {
    return (
      <div className={styles.panel}>
        <p className={styles.thinking}>Thinking…</p>
      </div>
    );
  }

  if (!feedback) {
    return <div className={styles.panel} />;
  }

  return (
    <div className={`${styles.panel} ${styles[feedback.quality]}`}>
      <span className={styles.label}>{QUALITY_LABELS[feedback.quality]}</span>
      <p className={styles.explanation}>{feedback.explanation}</p>
    </div>
  );
}
