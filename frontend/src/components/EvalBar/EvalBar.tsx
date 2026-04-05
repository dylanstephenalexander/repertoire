import styles from "./EvalBar.module.css";

interface EvalBarProps {
  evalCp: number | null;
  orientation: "white" | "black";
}

const CLAMP_CP = 1000;
const MATE_CP = 30000;

function cpToWhitePercent(evalCp: number | null): number {
  if (evalCp === null) return 50;
  if (evalCp >= MATE_CP) return 100;
  if (evalCp <= -MATE_CP) return 0;
  const clamped = Math.max(-CLAMP_CP, Math.min(CLAMP_CP, evalCp));
  return 50 + (clamped / CLAMP_CP) * 50;
}

export function EvalBar({ evalCp, orientation }: EvalBarProps) {
  const whitePercent = cpToWhitePercent(evalCp);
  // When orientation is black, the bar is flipped — white is at top
  const topPercent =
    orientation === "white" ? 100 - whitePercent : whitePercent;

  return (
    <div className={styles.bar} aria-label="Evaluation bar">
      <div className={styles.black} style={{ height: `${topPercent}%` }} />
      <div className={styles.white} style={{ height: `${100 - topPercent}%` }} />
    </div>
  );
}
