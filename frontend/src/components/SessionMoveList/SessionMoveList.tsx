import { useEffect, useRef } from "react";
import type { PositionEntry } from "../../types";
import styles from "./SessionMoveList.module.css";

interface Props {
  positions: PositionEntry[];
  viewIndex: number | null; // null = live
  onSelect: (i: number | null) => void;
}

const QUALITY_BADGE: Partial<Record<string, string>> = {
  mistake: "?",
  blunder: "??",
  alternative: "!?",
};

export function SessionMoveList({ positions, viewIndex, onSelect }: Props) {
  // Which index is currently highlighted; null-live means last position
  const activeIdx = viewIndex ?? (positions.length - 1);
  const isLive = viewIndex === null;
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active cell into view whenever it changes
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']") as HTMLElement | null;
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  // Build move rows: pair positions[1], positions[2] → row 1; [3],[4] → row 2; etc.
  const rows: Array<{ moveNum: number; wIdx: number; bIdx: number }> = [];
  for (let i = 1; i < positions.length; i += 2) {
    rows.push({
      moveNum: Math.ceil(i / 2),
      wIdx: i,
      bIdx: i + 1 < positions.length ? i + 1 : -1,
    });
  }

  function handleBack() {
    if (isLive) onSelect(positions.length - 2);
    else if (viewIndex! > 0) onSelect(viewIndex! - 1);
  }

  function handleForward() {
    if (!isLive) {
      if (viewIndex! >= positions.length - 1) onSelect(null);
      else onSelect(viewIndex! + 1);
    }
  }

  const canGoBack = isLive ? positions.length > 1 : activeIdx > 0;
  const canGoForward = !isLive;

  if (positions.length <= 1) return null; // nothing to show yet

  return (
    <div className={styles.container}>
      <div className={styles.navBar}>
        <button
          className={styles.navBtn}
          onClick={() => onSelect(0)}
          disabled={activeIdx === 0}
          title="Start"
        >⏮</button>
        <button
          className={styles.navBtn}
          onClick={handleBack}
          disabled={!canGoBack}
          title="Previous move"
        >◀</button>
        <button
          className={styles.navBtn}
          onClick={handleForward}
          disabled={!canGoForward}
          title="Next move"
        >▶</button>
        <button
          className={styles.navBtn}
          onClick={() => onSelect(null)}
          disabled={isLive}
          title="Current position"
        >⏭</button>
      </div>

      <div className={styles.moveList} ref={listRef}>
        {rows.map(({ moveNum, wIdx, bIdx }) => (
          <div key={moveNum} className={styles.moveRow}>
            <span className={styles.moveNumber}>{moveNum}.</span>
            <MoveCell
              entry={positions[wIdx]}
              index={wIdx}
              isActive={activeIdx === wIdx}
              isLive={isLive && wIdx === positions.length - 1}
              onSelect={onSelect}
            />
            {bIdx > 0 ? (
              <MoveCell
                entry={positions[bIdx]}
                index={bIdx}
                isActive={activeIdx === bIdx}
                isLive={isLive && bIdx === positions.length - 1}
                onSelect={onSelect}
              />
            ) : (
              <span className={styles.moveCell} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveCell({
  entry,
  index,
  isActive,
  isLive,
  onSelect,
}: {
  entry: PositionEntry;
  index: number;
  isActive: boolean;
  isLive: boolean;
  onSelect: (i: number | null) => void;
}) {
  if (!entry.san) return <span className={styles.moveCell} />;

  const badge = QUALITY_BADGE[entry.feedback?.quality ?? ""] ?? "";
  const qualityClass = entry.feedback?.quality
    ? (styles[`quality_${entry.feedback.quality}`] ?? "")
    : "";

  return (
    <button
      className={`${styles.moveCell} ${qualityClass} ${isActive ? styles.activeMove : ""}`}
      data-active={isActive ? "true" : undefined}
      onClick={() => onSelect(isLive ? null : index)}
    >
      {entry.san}
      {badge && <sup className={styles.badge}>{badge}</sup>}
    </button>
  );
}
