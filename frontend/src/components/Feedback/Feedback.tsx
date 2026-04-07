import type { Feedback as FeedbackType } from "../../types";
import { translateExplanation, type NotationMode } from "../../utils/notation";
import styles from "./Feedback.module.css";

interface FeedbackProps {
  feedback: FeedbackType | null;
  awaitingDecision: boolean;
  notationMode: NotationMode;
  explanationPending: boolean;
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
  awaitingDecision,
  notationMode,
  explanationPending,
  onRetry,
  onContinue,
  onRestart,
}: FeedbackProps) {
  if (!feedback) {
    return null;
  }

  return (
    <div className={`${styles.panel} ${styles[feedback.quality]}`}>
      <span className={styles.label}>{QUALITY_LABELS[feedback.quality]}</span>
      <p className={styles.explanation}>
        {feedback.llm_explanation ? feedback.explanation : translateExplanation(feedback.explanation, notationMode)}
        {explanationPending && <span className={styles.analyzing}> Analyzing...</span>}
      </p>
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
