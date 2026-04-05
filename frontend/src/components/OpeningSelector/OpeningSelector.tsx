import { useEffect, useState } from "react";
import { fetchOpenings } from "../../api/openings";
import type { SessionStartParams } from "../../api/session";
import type { OpeningSummary, VariationSummary } from "../../types";
import styles from "./OpeningSelector.module.css";

interface OpeningSelectorProps {
  onStart: (params: SessionStartParams) => void;
}

const SKILL_LEVELS = ["beginner", "intermediate", "advanced"] as const;
type SkillLevel = (typeof SKILL_LEVELS)[number];

export function OpeningSelector({ onStart }: OpeningSelectorProps) {
  const [openings, setOpenings] = useState<OpeningSummary[]>([]);
  const [selectedOpening, setSelectedOpening] =
    useState<OpeningSummary | null>(null);
  const [selectedVariation, setSelectedVariation] =
    useState<VariationSummary | null>(null);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("intermediate");
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
      skill_level: skillLevel,
    });
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h1 className={styles.title}>Repertoire</h1>

        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.section}>
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
          <section className={styles.section}>
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

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Skill level</h2>
          <div className={styles.skillRow}>
            {SKILL_LEVELS.map((level) => (
              <button
                key={level}
                className={`${styles.chip} ${skillLevel === level ? styles.selected : ""}`}
                onClick={() => setSkillLevel(level)}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </section>

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
