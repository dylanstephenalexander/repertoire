import styles from "./DebugPanel.module.css";

interface DebugPanelProps {
  debugMsg: string | null;
  opponentMoveDebug: string | null;
}

export function DebugPanel({ debugMsg, opponentMoveDebug }: DebugPanelProps) {
  if (!debugMsg && !opponentMoveDebug) return null;

  return (
    <div className={styles.panel}>
      <span className={styles.label}>Engine Timing</span>
      {opponentMoveDebug && <p className={styles.msg}>{opponentMoveDebug}</p>}
      {debugMsg && <p className={styles.msg}>{debugMsg}</p>}
    </div>
  );
}
