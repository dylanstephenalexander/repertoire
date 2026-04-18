import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChaosStartParams } from "../../api/chaos";
import styles from "./ChaosSelector.module.css";

interface ChaosSelectorProps {
  onStart: (params: ChaosStartParams) => void;
  onBack: () => void;
  lc0Available: boolean;
  availableModels: number[];
}

const ELO_BANDS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000] as const;
type ColorChoice = "white" | "black" | "random";

interface PillRect { top: number; left: number; width: number; height: number }

export function ChaosSelector({
  onStart,
  onBack,
  lc0Available,
  availableModels,
}: ChaosSelectorProps) {
  const [eloBand, setEloBand] = useState<number | null>(null);
  const [color, setColor] = useState<ColorChoice>("random");
  const gridRef = useRef<HTMLDivElement>(null);
  const [eloPill, setEloPill] = useState<PillRect | null>(null);

  // Persist last-used Elo band
  useEffect(() => {
    const saved = localStorage.getItem("chaos_elo_band");
    if (saved) setEloBand(Number(saved));
  }, []);

  // Measure selected button and move the pill to it
  useLayoutEffect(() => {
    if (eloBand === null || !gridRef.current) { setEloPill(null); return; }
    const idx = ELO_BANDS.indexOf(eloBand as typeof ELO_BANDS[number]);
    // child[0] is the pill div itself, buttons start at child[1]
    const btn = gridRef.current.children[idx + 1] as HTMLElement;
    if (!btn) return;
    setEloPill({ top: btn.offsetTop, left: btn.offsetLeft, width: btn.offsetWidth, height: btn.offsetHeight });
  }, [eloBand]);

  function handleStart() {
    if (!eloBand) return;
    localStorage.setItem("chaos_elo_band", String(eloBand));
    onStart({ color, elo_band: eloBand });
  }

  function bandLabel(band: number) {
    return band >= 2000 ? "2000+" : String(band);
  }

  function isBandDisabled(band: number) {
    if (band >= 2000) return false; // Stockfish — always available
    return !lc0Available || !availableModels.includes(band);
  }

  const canStart = !!eloBand && !isBandDisabled(eloBand);

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <button className={styles.backBtn} onClick={onBack}>← Back</button>
          <h1 className={styles.title}>Play vs Maia</h1>
        </div>

        {!lc0Available && (
          <div className={styles.warning}>
            <strong>lc0 not found.</strong> Maia models require lc0 to run.
            Install it and set <code>LC0_PATH</code>, or select 2000+ to play
            against full-strength Stockfish.
          </div>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Opponent Elo</h2>
          <div className={styles.eloGrid} ref={gridRef}>
            <div
              className={styles.eloPill}
              style={eloPill
                ? { top: eloPill.top, left: eloPill.left, width: eloPill.width, height: eloPill.height }
                : { opacity: 0 }
              }
            />
            {ELO_BANDS.map((band) => {
              const disabled = isBandDisabled(band);
              return (
                <button
                  key={band}
                  className={`${styles.eloBtn} ${eloBand === band ? styles.selected : ""} ${disabled ? styles.disabled : ""}`}
                  onClick={() => !disabled && setEloBand(band)}
                  disabled={disabled}
                >
                  {bandLabel(band)}
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Play as</h2>
          <div className={styles.segmented}>
            <div className={`${styles.segmentedPill} ${color === "black" ? styles.pillBlack : color === "random" ? styles.pillRandom : ""}`} />
            {(["white", "black", "random"] as const).map((c) => (
              <button
                key={c}
                className={`${styles.segmentedBtn} ${color === c ? styles.segmentedActive : ""}`}
                onClick={() => setColor(c)}
              >
                {c === "random" ? "Random" : c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <button
          className={styles.startButton}
          disabled={!canStart}
          onClick={handleStart}
        >
          Start
        </button>
      </div>
    </div>
  );
}
