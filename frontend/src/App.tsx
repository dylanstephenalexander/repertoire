import { useState } from "react";
import { Board } from "./components/Board/Board";
import { EvalBar } from "./components/EvalBar/EvalBar";
import { Feedback } from "./components/Feedback/Feedback";
import { OpeningSelector } from "./components/OpeningSelector/OpeningSelector";
import { useEval } from "./hooks/useEval";
import { useSession } from "./hooks/useSession";
import styles from "./App.module.css";

export function App() {
  const { session, begin, move } = useSession();
  const [selectorOpen, setSelectorOpen] = useState(true);

  // eval_cp from backend is side-to-move perspective; convert to white POV
  const { evalCp: rawEvalCp } = useEval(session?.fen ?? null);
  const whitePovCp = (() => {
    if (rawEvalCp === null || !session) return null;
    // Determine whose turn it is from the FEN (field 2: 'w' or 'b')
    const toMove = session.fen.split(" ")[1];
    return toMove === "b" ? -rawEvalCp : rawEvalCp;
  })();

  const isDisabled =
    !session ||
    session.status === "opponent_thinking" ||
    session.status === "complete";

  return (
    <div className={styles.root}>
      {selectorOpen && (
        <OpeningSelector
          onStart={async (params) => {
            setSelectorOpen(false);
            await begin(params);
          }}
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
            />
          )}
        </main>

        <aside className={styles.sidebar}>
          {session && (
            <div className={styles.score}>
              {session.score} / {session.moveCount}
            </div>
          )}
          <Feedback
            feedback={session?.feedback ?? null}
            isOpponentThinking={session?.status === "opponent_thinking"}
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
