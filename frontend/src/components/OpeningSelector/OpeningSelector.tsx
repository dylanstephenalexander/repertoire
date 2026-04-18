import { useEffect, useState } from "react";
import { fetchOpenings } from "../../api/openings";
import type { SessionStartParams } from "../../api/session";
import type { OpeningSummary, VariationSummary } from "../../types";
import styles from "./OpeningSelector.module.css";

interface OpeningSelectorProps {
  onStart: (params: SessionStartParams) => void;
  onBack: () => void;
}

export function OpeningSelector({ onStart, onBack }: OpeningSelectorProps) {
  const [openings, setOpenings] = useState<OpeningSummary[]>([]);
  const [selectedOpening, setSelectedOpening] =
    useState<OpeningSummary | null>(null);
  const [selectedVariation, setSelectedVariation] =
    useState<VariationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpenings()
      .then(setOpenings)
      .catch(() => setError("Failed to load openings."));
  }, []);

  function handleOpeningClick(opening: OpeningSummary) {
    setSelectedOpening(opening);
    setSelectedVariation(null);
  }

  function handleStart() {
    if (!selectedOpening || !selectedVariation) return;
    onStart({
      opening_id: selectedOpening.id,
      variation_id: selectedVariation.id,
      color: selectedOpening.color,
      mode: "study",
    });
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <button className={styles.backBtn} onClick={onBack}>← Back</button>
          <h1 className={styles.title}>Study Openings</h1>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <section key="openings" className={styles.section}>
          <h2 className={styles.sectionTitle}>Opening</h2>
          <ul className={styles.list}>
            {openings.map((o) => (
              <li key={o.id}>
                <button
                  className={`${styles.chip} ${selectedOpening?.id === o.id ? styles.selected : ""}`}
                  onClick={() => handleOpeningClick(o)}
                >
                  <span className={styles.chipName}>{o.name}</span>
                  <span className={`${styles.colorBadge} ${styles[o.color]}`}>
                    {o.color}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selectedOpening && (
          <section key={selectedOpening.id} className={styles.section}>
            <h2 className={styles.sectionTitle}>Variation</h2>
            <ul className={styles.list}>
              {selectedOpening.variations.map((v) => (
                <li key={v.id}>
                  <button
                    className={`${styles.chip} ${selectedVariation?.id === v.id ? styles.selected : ""}`}
                    onClick={() => setSelectedVariation(v)}
                  >
                    {v.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          className={styles.startButton}
          disabled={!selectedOpening || !selectedVariation}
          onClick={handleStart}
        >
          Start
        </button>
      </div>
    </div>
  );
}
