import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "./components/Board/Board";
import { ChaosSelector } from "./components/ChaosSelector/ChaosSelector";
import { EvalBar } from "./components/EvalBar/EvalBar";
import { DebugPanel } from "./components/DebugPanel/DebugPanel";
import { Feedback } from "./components/Feedback/Feedback";
import { GameReview } from "./components/GameReview/GameReview";
import { OpeningSelector } from "./components/OpeningSelector/OpeningSelector";
import { useChaos } from "./hooks/useChaos";
import { useEval } from "./hooks/useEval";
import { useSession } from "./hooks/useSession";
import { type NotationMode } from "./utils/notation";
import styles from "./App.module.css";

type AppMode = "home" | "study" | "chaos" | "review";

export function App() {
  const { session, begin, move, retry, continuePlay, restart, requestHint, clearSession } = useSession();
  const {
    chaosSession,
    engineStatus,
    checkEngineStatus,
    beginChaos,
    chaosMove,
    toggleFeedback,
    resign,
    clearChaosSession,
    restartChaos,
  } = useChaos();

  const [mode, setMode] = useState<AppMode>(() => {
    // Restore mode from history state on hard reload, default to home
    return (history.state?.mode as AppMode) ?? "home";
  });

  // Push a history entry whenever mode changes so the browser back button works
  function navigate(next: AppMode) {
    history.pushState({ mode: next }, "");
    setMode(next);
  }

  // Listen for browser back/forward
  useEffect(() => {
    function onPop(e: PopStateEvent) {
      const prev = (e.state?.mode as AppMode) ?? "home";
      // If navigating back from an active game, clear it
      if (prev === "home" || prev === "study" || prev === "chaos") {
        clearSession();
        clearChaosSession();
      }
      setMode(prev);
      setGuided(false);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [clearSession, clearChaosSession]); // eslint-disable-line react-hooks/exhaustive-deps
  const [skillLevel, setSkillLevel] = useState("intermediate");
  const [guided, setGuided] = useState(false);
  const notationMode: NotationMode = "readable";

  // Fetch engine status once so ChaosSelector can show what's available
  useEffect(() => {
    checkEngineStatus();
  }, [checkEngineStatus]);

  // Active FEN: use whichever session is live
  const activeFen = session?.fen ?? chaosSession?.fen ?? null;
  const activeColor = session?.userColor ?? chaosSession?.userColor ?? "white";

  // eval_cp from backend is side-to-move perspective; convert to white POV
  const { evalCp: rawEvalCp } = useEval(activeFen);
  const whitePovCp = (() => {
    if (rawEvalCp === null || !activeFen) return null;
    const toMove = activeFen.split(" ")[1];
    return toMove === "b" ? -rawEvalCp : rawEvalCp;
  })();

  // Study: guided auto-hint
  useEffect(() => {
    if (!guided || !session || session.status !== "playing" || session.hint) return;
    const toMove = session.fen.split(" ")[1];
    const userSide = session.userColor === "white" ? "w" : "b";
    if (toMove !== userSide) return;
    requestHint();
  }, [session?.fen, guided]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRestart() {
    await restart();
  }

  // ── Review mode ──────────────────────────────────────────────────────────
  if (mode === "review") {
    return (
      <div className={styles.root}>
        <GameReview skillLevel={skillLevel} onBack={() => navigate("home")} />
      </div>
    );
  }

  // ── Home screen ──────────────────────────────────────────────────────────
  if (mode === "home") {
    return (
      <div className={styles.root}>
        <div className={styles.home}>
          <h1 className={styles.homeTitle}>Repertoire</h1>
          <div className={styles.homeButtons}>
            <button className={styles.primaryBtn} onClick={() => navigate("study")}>
              Study Openings
            </button>
            <button className={styles.primaryBtn} onClick={() => navigate("chaos")}>
              Play vs Maia
            </button>
            <button className={styles.secondaryBtn} onClick={() => navigate("review")}>
              Review a Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Study selector (modal) ────────────────────────────────────────────────
  if (mode === "study" && !session) {
    return (
      <div className={styles.root}>
        <OpeningSelector
          onStart={async (params) => {
            setSkillLevel(params.skill_level);
            await begin(params);
          }}
          onBack={() => navigate("home")}
        />
      </div>
    );
  }

  // ── Chaos selector (modal) ────────────────────────────────────────────────
  if (mode === "chaos" && !chaosSession) {
    return (
      <div className={styles.root}>
        <ChaosSelector
          onStart={async (params) => {
            setSkillLevel(params.skill_level);
            await beginChaos(params);
          }}
          onBack={() => navigate("home")}
          lc0Available={engineStatus?.lc0 ?? false}
          availableModels={engineStatus?.maiaModels ?? []}
        />
      </div>
    );
  }

  // ── Active game (study or chaos) ──────────────────────────────────────────
  const isStudy = mode === "study" && !!session;
  const isChaos = mode === "chaos" && !!chaosSession;

  const currentFen = isStudy ? session!.fen : chaosSession!.fen;
  const currentColor = isStudy ? session!.userColor : chaosSession!.userColor;
  const currentStatus = isStudy ? session!.status : chaosSession!.status;
  const currentFeedback = isStudy ? (session!.feedback ?? null) : (chaosSession!.feedback ?? null);
  const currentDebugMsg = isStudy ? (session!.debugMsg ?? null) : (chaosSession!.debugMsg ?? null);
  const currentOpponentMoveDebug = isChaos ? (chaosSession!.opponentMoveDebug ?? null) : null;

  const isDisabled =
    currentStatus === "opponent_thinking" ||
    currentStatus === "awaiting_decision" ||
    currentStatus === "complete";

  return (
    <div className={styles.root}>
      <div className={styles.layout}>
        <aside className={styles.evalBarWrapper}>
          <EvalBar evalCp={whitePovCp} orientation={currentColor} />
        </aside>

        <main className={styles.boardWrapper}>
          <Board
            fen={currentFen}
            orientation={currentColor}
            onMove={isStudy ? move : chaosMove}
            disabled={isDisabled}
            hintMove={isStudy ? (session!.hint?.uci || undefined) : undefined}
          />
        </main>

        <aside className={styles.sidebar}>
          {/* Score — study only */}
          {isStudy && (
            <div className={styles.score}>
              {session!.score} / {session!.moveCount}
            </div>
          )}

          {/* Opening name — chaos only */}
          {isChaos && (
            <div className={chaosSession!.inTheory ? styles.openingName : styles.openingNameFaded}>
              {chaosSession!.openingName ?? "Opening"}
            </div>
          )}

          {/* Feedback toggle — chaos only */}
          {isChaos && currentStatus !== "complete" && (
            <button className={styles.toggleBtn} onClick={toggleFeedback}>
              Feedback: {chaosSession!.feedbackEnabled ? "On" : "Off"}
            </button>
          )}

          {/* Hint controls — study only */}
          {isStudy && currentStatus === "playing" && (
            <div className={styles.hintArea}>
              {guided ? (
                <>
                  <div className={styles.hintRow}>
                    <span className={styles.guidedLabel}>Guided</span>
                    {session!.hint && (
                      <span className={styles.hintText}>{session!.hint.san}</span>
                    )}
                  </div>
                  <button className={styles.guidedToggle} onClick={() => setGuided(false)}>
                    Test yourself →
                  </button>
                </>
              ) : (
                <div className={styles.hintRow}>
                  <button
                    className={styles.hintButton}
                    onClick={requestHint}
                    disabled={!!session!.hint}
                  >
                    Hint
                  </button>
                  {session!.hint ? (
                    <span className={styles.hintText}>{session!.hint.san}</span>
                  ) : (
                    <button className={styles.guidedToggle} onClick={() => setGuided(true)}>
                      Guided mode
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Engine timing debug panel */}
          <DebugPanel debugMsg={currentDebugMsg} opponentMoveDebug={currentOpponentMoveDebug} />

          {/* Feedback panel */}
          <Feedback
            feedback={currentFeedback}
            awaitingDecision={currentStatus === "awaiting_decision"}
            notationMode={notationMode}
            onRetry={retry}
            onContinue={continuePlay}
            onRestart={handleRestart}
          />

          {/* End-of-game actions */}
          {currentStatus === "complete" && (
            <div className={styles.completeActions}>
              <div className={styles.gameOverMsg}>
                {(() => {
                  try {
                    const chess = new Chess(currentFen);
                    if (chess.isCheckmate()) {
                      const winner = chess.turn() === "w" ? "Black" : "White";
                      return `${winner} wins by checkmate`;
                    }
                    if (chess.isStalemate()) return "Draw — stalemate";
                    if (chess.isDraw()) return "Draw";
                  } catch { /* ignore */ }
                  return isStudy ? "Opening complete" : "Game over";
                })()}
              </div>
              <button className={styles.primaryBtn} onClick={async () => {
                if (isStudy) await handleRestart();
                else await restartChaos();
              }}>
                Play again
              </button>
              <button className={styles.secondaryBtn} onClick={() => {
                if (isStudy) { clearSession(); }
                else { clearChaosSession(); }
                setGuided(false);
              }}>
                New game
              </button>
              <button className={styles.secondaryBtn} onClick={() => {
                clearSession();
                clearChaosSession();
                setGuided(false);
                navigate("home");
              }}>
                Home
              </button>
            </div>
          )}

          {/* Resign — chaos only, while playing */}
          {isChaos && currentStatus === "playing" && (
            <button className={styles.resignBtn} onClick={resign}>
              Resign
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
