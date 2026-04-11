import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "./components/Board/Board";
import { CapturedPieces } from "./components/CapturedPieces/CapturedPieces";
import { ChaosSelector } from "./components/ChaosSelector/ChaosSelector";
import { EvalBar } from "./components/EvalBar/EvalBar";
import { DebugPanel } from "./components/DebugPanel/DebugPanel";
import { Feedback } from "./components/Feedback/Feedback";
import { GameReview } from "./components/GameReview/GameReview";
import { OpeningSelector } from "./components/OpeningSelector/OpeningSelector";
import { SessionMoveList } from "./components/SessionMoveList/SessionMoveList";
import { useChaos } from "./hooks/useChaos";
import { useChessSound } from "./hooks/useChessSound";
import { useEval } from "./hooks/useEval";
import { useSession } from "./hooks/useSession";
import { type NotationMode } from "./utils/notation";
import styles from "./App.module.css";

type AppMode = "home" | "study" | "chaos" | "review";

export function App() {
  const {
    session,
    rejection,
    begin,
    move,
    continuePlay,
    restart,
    requestHint,
    dismissRejection,
    clearSession,
    goToIndex,
    updatePositionEval,
  } = useSession();
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
    goToChaosIndex,
    updateChaosPositionEval,
  } = useChaos();

  const [mode, setMode] = useState<AppMode>(() => {
    return (history.state?.mode as AppMode) ?? "home";
  });

  function navigate(next: AppMode) {
    history.pushState({ mode: next }, "");
    setMode(next);
  }

  useEffect(() => {
    function onPop(e: PopStateEvent) {
      const prev = (e.state?.mode as AppMode) ?? "home";
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

  const [guided, setGuided] = useState(false);
  const notationMode: NotationMode = "readable";
  const { playMoveSound } = useChessSound();

  // Play a sound whenever a new position is pushed (user or opponent move)
  const prevPositionCountRef = useRef(0);
  useEffect(() => {
    const positions = session?.positions ?? chaosSession?.positions ?? [];
    if (positions.length > prevPositionCountRef.current && prevPositionCountRef.current > 0) {
      const last = positions[positions.length - 1];
      if (last?.san) playMoveSound(last.san);
    }
    prevPositionCountRef.current = positions.length;
  }, [session?.positions.length, chaosSession?.positions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    checkEngineStatus();
  }, [checkEngineStatus]);

  const isStudy = mode === "study" && !!session;
  const isChaos = mode === "chaos" && !!chaosSession;

  // ── Review mode (history navigation) ────────────────────────────────────
  const studyReviewing = isStudy && session.viewIndex !== null;
  const chaosReviewing = isChaos && chaosSession.viewIndex !== null;
  const isReviewing = studyReviewing || chaosReviewing;

  // The FEN shown on the board — historical when reviewing, live otherwise
  const displayFen = (() => {
    if (studyReviewing) return session.positions[session.viewIndex!].fen;
    if (chaosReviewing) return chaosSession.positions[chaosSession.viewIndex!].fen;
    if (isStudy) return session.fen;
    if (isChaos) return chaosSession.fen;
    return null;
  })();

  // Feedback shown — historical when reviewing, live otherwise
  const displayFeedback = (() => {
    if (studyReviewing) return session.positions[session.viewIndex!].feedback;
    if (chaosReviewing) return chaosSession.positions[chaosSession.viewIndex!].feedback;
    if (isStudy) return session.feedback;
    if (isChaos) return chaosSession.feedback;
    return null;
  })();

  // ── Eval bar ─────────────────────────────────────────────────────────────
  // Use stored eval when available to avoid re-fetching during navigation
  const storedEval = (() => {
    if (studyReviewing) return session.positions[session.viewIndex!].evalCp;
    if (chaosReviewing) return chaosSession.positions[chaosSession.viewIndex!].evalCp;
    return null;
  })();

  // Only hit the engine when we don't have a stored value
  const evalFen = storedEval !== null ? null : displayFen;
  const { evalCp: fetchedEvalCp } = useEval(evalFen);
  const rawEvalCp = storedEval ?? fetchedEvalCp;

  // Store freshly-fetched evals back into positions so navigation is instant
  useEffect(() => {
    if (fetchedEvalCp === null || evalFen === null) return;
    if (isStudy) updatePositionEval(evalFen, fetchedEvalCp);
    else if (isChaos) updateChaosPositionEval(evalFen, fetchedEvalCp);
  }, [fetchedEvalCp, evalFen]); // eslint-disable-line react-hooks/exhaustive-deps

  const whitePovCp = (() => {
    if (rawEvalCp === null || !displayFen) return null;
    const toMove = displayFen.split(" ")[1];
    return toMove === "b" ? -rawEvalCp : rawEvalCp;
  })();

  // ── Study guided auto-hint ───────────────────────────────────────────────
  useEffect(() => {
    if (!guided || !session || session.status !== "playing" || session.hint) return;
    const toMove = session.fen.split(" ")[1];
    const userSide = session.userColor === "white" ? "w" : "b";
    if (toMove !== userSide) return;
    requestHint();
  }, [session?.fen, guided]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived display values ───────────────────────────────────────────────
  const currentColor = isStudy ? session!.userColor : isChaos ? chaosSession!.userColor : "white";
  const currentStatus = isStudy ? session!.status : isChaos ? chaosSession!.status : "idle";
  const currentDebugMsg = isStudy ? (session!.debugMsg ?? null) : isChaos ? (chaosSession!.debugMsg ?? null) : null;
  const currentLlmDebugMsg = isStudy ? (session!.llmDebugMsg ?? null) : isChaos ? (chaosSession!.llmDebugMsg ?? null) : null;
  const currentOpponentMoveDebug = isChaos ? (chaosSession!.opponentMoveDebug ?? null) : null;
  const currentExplanationPending = isStudy
    ? session!.explanationPending
    : isChaos ? chaosSession!.explanationPending : false;

  const isDisabled =
    currentStatus === "opponent_thinking" ||
    currentStatus === "complete" ||
    isReviewing;

  // ── Review mode ──────────────────────────────────────────────────────────
  if (mode === "review") {
    return (
      <div className={styles.root}>
        <GameReview onBack={() => navigate("home")} />
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
          onStart={async (params) => { await begin(params); }}
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
          onStart={async (params) => { await beginChaos(params); }}
          onBack={() => navigate("home")}
          lc0Available={engineStatus?.lc0 ?? false}
          availableModels={engineStatus?.maiaModels ?? []}
        />
      </div>
    );
  }

  // ── Active game (study or chaos) ──────────────────────────────────────────
  const currentFen = isStudy ? session!.fen : chaosSession!.fen;

  return (
    <div className={styles.root}>
      <div className={styles.layout}>
        <aside className={styles.evalBarWrapper}>
          <EvalBar evalCp={whitePovCp} orientation={currentColor} />
        </aside>

        <main className={styles.boardWrapper}>
          <CapturedPieces
            fen={displayFen ?? currentFen}
            color={currentColor === "white" ? "black" : "white"}
          />
          <Board
            fen={displayFen ?? currentFen}
            orientation={currentColor}
            onMove={isStudy ? move : chaosMove}
            disabled={isDisabled}
            allowPreMove={currentStatus === "opponent_thinking"}
            hintMove={isStudy && !isReviewing ? (session!.hint?.uci || undefined) : undefined}
          />
          <CapturedPieces
            fen={displayFen ?? currentFen}
            color={currentColor}
          />
        </main>

        <aside className={styles.sidebar}>
          {/* Score — study only */}
          {isStudy && (
            <div className={styles.score}>
              {session!.score} / {session!.moveCount}
            </div>
          )}

          {/* Opening name — chaos only, hidden until detected */}
          {isChaos && chaosSession!.openingName && (
            <div className={chaosSession!.inTheory ? styles.openingName : styles.openingNameFaded}>
              {chaosSession!.openingName}
            </div>
          )}

          {/* Feedback toggle — chaos only */}
          {isChaos && currentStatus !== "complete" && (
            <button className={styles.toggleBtn} onClick={toggleFeedback}>
              Feedback: {chaosSession!.feedbackEnabled ? "On" : "Off"}
            </button>
          )}

          {/* Move history */}
          {isStudy && (
            <SessionMoveList
              positions={session!.positions}
              viewIndex={session!.viewIndex}
              onSelect={goToIndex}
            />
          )}
          {isChaos && (
            <SessionMoveList
              positions={chaosSession!.positions}
              viewIndex={chaosSession!.viewIndex}
              onSelect={goToChaosIndex}
            />
          )}

          {/* Hint controls — study only, not while reviewing */}
          {isStudy && currentStatus === "playing" && !isReviewing && (
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
                    <button className={styles.hintButton} onClick={() => setGuided(true)}>
                      Guided Mode
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Engine timing debug panel */}
          <DebugPanel
            debugMsg={currentDebugMsg}
            opponentMoveDebug={currentOpponentMoveDebug}
            llmDebugMsg={currentLlmDebugMsg}
            explanationPending={currentExplanationPending}
          />

          {/* Rejection message — study only, while playing */}
          {isStudy && !isReviewing && rejection && (
            <div className={styles.rejectionPanel}>
              <p className={styles.rejectionMsg}>{rejection.message}</p>
              {rejection.showGuidedPrompt && (
                <div className={styles.guidedPrompt}>
                  <span>Turn on guided mode?</span>
                  <button className={styles.toggleBtn} onClick={() => { setGuided(true); dismissRejection(); }}>
                    Yes
                  </button>
                  <button className={styles.toggleBtn} onClick={dismissRejection}>
                    No
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Feedback panel — live or historical */}
          {!isReviewing && !rejection && (
            <Feedback
              feedback={displayFeedback}
              awaitingDecision={false}
              notationMode={notationMode}
              onRetry={async () => {}}
              onContinue={continuePlay}
              onRestart={async () => {
                if (isStudy) await restart();
                else await restartChaos();
              }}
            />
          )}
          {isReviewing && displayFeedback && (
            <Feedback
              feedback={displayFeedback}
              awaitingDecision={false}
              notationMode={notationMode}
              onRetry={async () => {}}
              onContinue={async () => {}}
              onRestart={async () => {}}
            />
          )}

          {/* End-of-game actions */}
          {currentStatus === "complete" && !isReviewing && (
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
                if (isStudy) await restart();
                else await restartChaos();
              }}>
                Play again
              </button>
              <button className={styles.secondaryBtn} onClick={() => {
                if (isStudy) clearSession();
                else clearChaosSession();
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
          {isChaos && currentStatus === "playing" && !isReviewing && (
            <button className={styles.resignBtn} onClick={resign}>
              Resign
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
