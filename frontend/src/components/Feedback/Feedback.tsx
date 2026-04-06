import type { Feedback as FeedbackType } from "../../types";
import { translateExplanation, type NotationMode } from "../../utils/notation";
import styles from "./Feedback.module.css";

interface FeedbackProps {
  feedback: FeedbackType | null;
  isOpponentThinking: boolean;
  awaitingDecision: boolean;
  notationMode: NotationMode;
  onRetry: () => void;
  onContinue: () => void;
  onRestart: () => void;
}

const QUALITY_LABELS: Record<FeedbackType["quality"], string> = {
  correct: "Correct",
  alternative: "Alternative",
  mistake: "Mistake",
  blunder: "Blunder",
  checkmate: "Checkmate",
};

export function Feedback({
  feedback,
  isOpponentThinking,
  awaitingDecision,
  notationMode,
  onRetry,
  onContinue,
  onRestart,
}: FeedbackProps) {
  if (isOpponentThinking) {
    return (
      <div className={styles.panel}>
        <p className={styles.thinking}>Thinking…</p>
      </div>
    );
  }

  if (!feedback) {
    return null;
  }

  return (
    <div className={`${styles.panel} ${styles[feedback.quality]}`}>
      <span className={styles.label}>{QUALITY_LABELS[feedback.quality]}</span>
      <p className={styles.explanation}>{translateExplanation(feedback.explanation, notationMode)}</p>
      {awaitingDecision && (
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={onRetry}>
            Retry
          </button>
          <button className={styles.actionBtn} onClick={onContinue}>
            Continue
          </button>
          <button className={`${styles.actionBtn} ${styles.restartBtn}`} onClick={onRestart}>
            Restart
          </button>
        </div>
      )}
    </div>
  );
}
