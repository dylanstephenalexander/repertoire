import { useState } from "react";
import { Board } from "./components/Board/Board";
import { EvalBar } from "./components/EvalBar/EvalBar";
import { Feedback } from "./components/Feedback/Feedback";
import { GameReview } from "./components/GameReview/GameReview";
import { OpeningSelector } from "./components/OpeningSelector/OpeningSelector";
import { useEval } from "./hooks/useEval";
import { useSession } from "./hooks/useSession";
import styles from "./App.module.css";

type AppMode = "study" | "review";

export function App() {
  const { session, begin, move, retry, continuePlay, restart, requestHint } = useSession();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [mode, setMode] = useState<AppMode>("study");
  const [skillLevel, setSkillLevel] = useState("intermediate");

  // eval_cp from backend is side-to-move perspective; convert to white POV
  const { evalCp: rawEvalCp } = useEval(session?.fen ?? null);
  const whitePovCp = (() => {
    if (rawEvalCp === null || !session) return null;
    const toMove = session.fen.split(" ")[1];
    return toMove === "b" ? -rawEvalCp : rawEvalCp;
  })();

  const isDisabled =
    !session ||
    session.status === "opponent_thinking" ||
    session.status === "awaiting_decision" ||
    session.status === "complete";

  async function handleRestart() {
    await restart();
  }

  if (mode === "review") {
    return (
      <div className={styles.root}>
        <GameReview
          skillLevel={skillLevel}
          onBack={() => setMode("study")}
        />
      </div>
    );
  }

  // Home screen — no active session, selector not open
  if (!session && !selectorOpen) {
    return (
      <div className={styles.root}>
        <div className={styles.home}>
          <h1 className={styles.homeTitle}>Repertoire</h1>
          <div className={styles.homeButtons}>
            <button className={styles.primaryBtn} onClick={() => setSelectorOpen(true)}>
              Study Openings
            </button>
            <button className={styles.secondaryBtn} onClick={() => setMode("review")}>
              Review a Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {selectorOpen && (
        <OpeningSelector
          onStart={async (params) => {
            setSkillLevel(params.skill_level);
            setSelectorOpen(false);
            await begin(params);
          }}
          onBack={() => setSelectorOpen(false)}
        />
      )}

      <div className={styles.layout}>
        <aside className={styles.evalBarWrapper}>
          {session && (
            <EvalBar evalCp={whitePovCp} orientation={session.userColor} />
          )}
        </aside>

        <main className={styles.boardWrapper}>
          {session && (
            <Board
              fen={session.fen}
              orientation={session.userColor}
              onMove={move}
              disabled={isDisabled}
              hintMove={session.hint?.uci}
            />
          )}
        </main>

        <aside className={styles.sidebar}>
          {session && (
            <div className={styles.score}>
              {session.score} / {session.moveCount}
            </div>
          )}
          {session?.status === "playing" && (
            <div className={styles.hintRow}>
              <button className={styles.hintButton} onClick={requestHint}>
                Hint
              </button>
              {session.hint && (
                <span className={styles.hintText}>{session.hint.san}</span>
              )}
            </div>
          )}
          <Feedback
            feedback={session?.feedback ?? null}
            isOpponentThinking={session?.status === "opponent_thinking"}
            awaitingDecision={session?.status === "awaiting_decision"}
            onRetry={retry}
            onContinue={continuePlay}
            onRestart={handleRestart}
          />
          {session?.status === "complete" && (
            <button
              className={styles.newGameButton}
              onClick={() => setSelectorOpen(true)}
            >
              New game
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
