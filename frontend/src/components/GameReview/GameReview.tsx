import { useEffect, useState } from "react";
import { Board } from "../Board/Board";
import { EvalBar } from "../EvalBar/EvalBar";
import { MoveList } from "./MoveList";
import { useReview } from "../../hooks/useReview";
import type { GameSummary } from "../../types";
import styles from "./GameReview.module.css";

interface GameReviewProps {
  onBack: () => void;
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}
function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function GameReview({ onBack }: GameReviewProps) {
  const { state, loadGames, analyse, goToMove, nextMove, prevMove, reset, currentFen, currentEvalCp, currentAnnotation } = useReview();

  const [source, setSource] = useState<"chess.com" | "lichess">("chess.com");
  const [username, setUsername] = useState(() => localStorage.getItem("review_username") ?? "");

  useEffect(() => {
    if (username) localStorage.setItem("review_username", username);
  }, [username]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  function doFetch(y: number, m: number) {
    setYear(y); setMonth(m);
    loadGames({ username, source, year: source === "chess.com" ? y : undefined, month: source === "chess.com" ? m : undefined });
  }

  function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    doFetch(year, month);
  }

  function handleBack() { reset(); onBack(); }

  const { phase, games, review, error } = state;

  // ── Reviewing ────────────────────────────────────────────────────────────
  if (phase === "reviewing" && review) {
    return (
      <div className={styles.reviewLayout}>
        <aside className={styles.evalBarWrapper}>
          <EvalBar evalCp={currentEvalCp} orientation="white" />
        </aside>
        <main className={styles.boardWrapper}>
          <Board fen={currentFen} orientation="white" onMove={() => {}} disabled />
          <div className={styles.navBar}>
            <button className={styles.navBtn} onClick={() => goToMove(-1)}>|◀</button>
            <button className={styles.navBtn} onClick={prevMove}>◀</button>
            <button className={styles.navBtn} onClick={nextMove}>▶</button>
            <button className={styles.navBtn} onClick={() => goToMove(review.moves.length - 1)}>▶|</button>
          </div>
          {currentAnnotation?.explanation && (
            <div className={`${styles.annotation} ${styles[`quality_${currentAnnotation.quality}`] ?? ""}`}>
              <strong>{currentAnnotation.quality.charAt(0).toUpperCase() + currentAnnotation.quality.slice(1)}</strong>
              {" — "}{currentAnnotation.explanation}
            </div>
          )}
        </main>
        <aside className={styles.sidebar}>
          <div className={styles.gameHeader}>
            <span className={styles.gamePlayers}>{review.white} vs {review.black}</span>
            <span className={styles.result}>{review.result}</span>
          </div>
          <MoveList moves={review.moves} currentIndex={state.currentMoveIndex} onSelect={goToMove} />
          <button className={styles.backBtn} onClick={handleBack}>← Back to menu</button>
        </aside>
      </div>
    );
  }

  // ── Analysing ────────────────────────────────────────────────────────────
  if (phase === "analysing") {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.spinner} />
          <p className={styles.spinnerLabel}>Analysing with Stockfish…</p>
          <p className={styles.spinnerHint}>This may take a minute for longer games.</p>
        </div>
      </div>
    );
  }

  // ── Setup + game list ────────────────────────────────────────────────────
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <button className={styles.backBtn} onClick={handleBack}>← Back</button>
          <h1 className={styles.title}>Review a Game</h1>
        </div>

        <form onSubmit={handleFetch}>
          <div className={styles.formSections}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Source</h2>
              <div className={styles.chipRow}>
                {(["chess.com", "lichess"] as const).map((s) => (
                  <button key={s} type="button"
                    className={`${styles.chip} ${styles.chipCenter} ${source === s ? styles.selected : ""}`}
                    onClick={() => setSource(s)}
                  >
                    {s === "chess.com" ? "Chess.com" : "Lichess"}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Username</h2>
              <input
                className={styles.input}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={`Your ${source === "chess.com" ? "Chess.com" : "Lichess"} username`}
                autoComplete="off"
                required
              />
            </section>
          </div>

          <button type="submit" className={styles.startButton}
            disabled={phase === "fetching" || !username.trim()}>
            {phase === "fetching" ? "Fetching…" : "Find Games"}
          </button>
        </form>

        {error && <p className={styles.error}>{error}</p>}

        {phase === "selecting" && (
          <>
            {source === "chess.com" && (
              <div className={styles.monthNav}>
                <button type="button" className={styles.monthBtn}
                  onClick={() => { const p = prevMonth(year, month); doFetch(p.year, p.month); }}>
                  ← {MONTH_NAMES[prevMonth(year, month).month - 1]}
                </button>
                <span className={styles.monthLabel}>{MONTH_NAMES[month - 1]} {year}</span>
                <button type="button" className={styles.monthBtn}
                  disabled={isCurrentMonth}
                  onClick={() => { const n = nextMonth(year, month); doFetch(n.year, n.month); }}>
                  {MONTH_NAMES[nextMonth(year, month).month - 1]} →
                </button>
              </div>
            )}

            {games.length === 0
              ? <p className={styles.empty}>No games found.</p>
              : (
                <ul className={styles.list}>
                  {games.map((g) => (
                    <li key={g.url}>
                      <GameChip game={g} onAnalyse={() => analyse(g.pgn)} />
                    </li>
                  ))}
                </ul>
              )
            }
          </>
        )}
      </div>
    </div>
  );
}

function resultClass(result: string) {
  if (result === "1-0") return styles.resultWhite;
  if (result === "0-1") return styles.resultBlack;
  return styles.resultDraw;
}

function GameChip({ game, onAnalyse }: { game: GameSummary; onAnalyse: () => void }) {
  return (
    <button className={styles.chip} onClick={onAnalyse}>
      <span className={styles.chipName}>{game.white} vs {game.black}</span>
      <span className={`${styles.badge} ${resultClass(game.result)}`}>{game.result}</span>
    </button>
  );
}
