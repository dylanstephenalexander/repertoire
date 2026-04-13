import { useEffect, useRef } from "react";
import {
  THEMES,
  PIECE_SETS,
  SOUND_THEMES,
  type ThemeId,
} from "../../themes";
import { type UserSettings } from "../../hooks/useSettings";
import styles from "./Settings.module.css";

interface SettingsProps {
  settings: UserSettings;
  onUpdate: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  onClose: () => void;
}

const THEME_IDS = Object.keys(THEMES) as ThemeId[];
const NOTATION_OPTIONS: { value: UserSettings["notationMode"]; label: string }[] = [
  { value: "algebraic", label: "Algebraic" },
  { value: "readable",  label: "English" },
  { value: "both",      label: "Both" },
];

export function Settings({ settings, onUpdate, onClose }: SettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay so the opening click doesn't immediately close the panel
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel} ref={panelRef} role="dialog" aria-label="Settings">
        <div className={styles.header}>
          <span className={styles.title}>Settings</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className={styles.body}>

          {/* ── APPEARANCE ─────────────────────────────────────────────────── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Appearance</h3>

            <div className={styles.row}>
              <span className={styles.rowLabel}>UI Theme</span>
              <div className={styles.chips}>
                {THEME_IDS.map((id) => (
                  <button
                    key={id}
                    className={`${styles.chip} ${settings.uiTheme === id ? styles.chipSelected : ""}`}
                    onClick={() => onUpdate("uiTheme", id)}
                  >
                    {THEMES[id].label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.row}>
              <span className={styles.rowLabel}>Board</span>
              <div className={styles.chips}>
                {THEME_IDS.map((id) => (
                  <button
                    key={id}
                    className={`${styles.chip} ${settings.boardStyle === id ? styles.chipSelected : ""}`}
                    onClick={() => onUpdate("boardStyle", id)}
                  >
                    {THEMES[id].label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.row}>
              <span className={styles.rowLabel}>Pieces</span>
              <div className={styles.chips}>
                {Object.entries(PIECE_SETS).map(([id, def]) => (
                  <button
                    key={id}
                    className={`${styles.chip} ${settings.pieceSet === id ? styles.chipSelected : ""} ${styles.chipDisabled}`}
                    disabled
                  >
                    {def.label}
                  </button>
                ))}
                <span className={styles.comingSoon}>More coming</span>
              </div>
            </div>
          </section>

          {/* ── SOUND ──────────────────────────────────────────────────────── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Sound</h3>

            <div className={styles.row}>
              <span className={styles.rowLabel}>Theme</span>
              <div className={styles.chips}>
                {Object.entries(SOUND_THEMES).map(([id, def]) => (
                  <button
                    key={id}
                    className={`${styles.chip} ${settings.soundTheme === id ? styles.chipSelected : ""} ${styles.chipDisabled}`}
                    disabled
                  >
                    {def.label}
                  </button>
                ))}
                <span className={styles.comingSoon}>More coming</span>
              </div>
            </div>
          </section>

          {/* ── DISPLAY ────────────────────────────────────────────────────── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Display</h3>

            <div className={styles.row}>
              <span className={styles.rowLabel}>Eval Bar</span>
              <button
                className={`${styles.toggle} ${settings.evalBarVisible ? styles.toggleOn : ""}`}
                onClick={() => onUpdate("evalBarVisible", !settings.evalBarVisible)}
                aria-pressed={settings.evalBarVisible}
              >
                <span className={styles.toggleThumb} />
              </button>
            </div>

            <div className={styles.row}>
              <span className={styles.rowLabel}>Notation</span>
              <div className={styles.chips}>
                {NOTATION_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    className={`${styles.chip} ${settings.notationMode === value ? styles.chipSelected : ""}`}
                    onClick={() => onUpdate("notationMode", value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
