import { useEffect, useCallback, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import styles from "./Board.module.css";

interface BoardProps {
  fen: string;
  orientation: "white" | "black";
  onMove: (uciMove: string) => void;
  disabled: boolean;
  allowPreMove?: boolean;
  hintMove?: string; // UCI move to highlight (from + to squares) when a hint is active
}

/** Return the UCI move string if the drop is legal, or null. */
export function resolveMove(
  fen: string,
  from: string,
  to: string
): string | null {
  const chess = new Chess(fen);
  const legalMoves = chess.moves({ verbose: true });

  // Direct match
  const direct = legalMoves.find((m) => m.from === from && m.to === to);
  if (direct) {
    // Always promote to queen — no promotion-picker UI in this app
    return direct.promotion ? `${from}${to}q` : `${from}${to}`;
  }

  // King dragged onto own rook → castling. Map rook square to king destination.
  const piece = chess.get(from as Parameters<typeof chess.get>[0]);
  const target = chess.get(to as Parameters<typeof chess.get>[0]);
  if (
    piece?.type === "k" &&
    target?.type === "r" &&
    target.color === piece.color
  ) {
    // Determine castle destination from rook file
    const rookFile = to[0];
    const rank = from[1];
    const castleTo = rookFile > "e" ? `g${rank}` : `c${rank}`;
    const castle = legalMoves.find((m) => m.from === from && m.to === castleTo);
    if (castle) return `${from}${castleTo}`;
  }

  return null;
}

/**
 * Validate a pre-move by flipping the FEN active color and checking legality.
 * En passant is cleared — it belongs to the current side and is invalid after flipping.
 * Returns the resolved UCI string if pseudo-legal, or null.
 */
export function resolvePreMove(fen: string, from: string, to: string): string | null {
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  try {
    return resolveMove(parts.join(" "), from, to);
  } catch {
    return null;
  }
}

export function Board({ fen, orientation, onMove, disabled, allowPreMove = false, hintMove }: BoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [preMoveDisplay, setPreMoveDisplay] = useState<string | null>(null);
  const preMoveRef = useRef<string | null>(null);
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAllowPreMoveRef = useRef(allowPreMove);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  // Keep refs current so drag callbacks always read latest values, not stale closures.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const allowPreMoveRef = useRef(allowPreMove);
  allowPreMoveRef.current = allowPreMove;

  function setPreMove(uci: string | null) {
    preMoveRef.current = uci;
    setPreMoveDisplay(uci);
  }

  const triggerShake = useCallback(() => {
    if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current);
    setShaking(true);
    shakeTimeoutRef.current = setTimeout(() => setShaking(false), 150);
  }, []);

  // Fire or cancel pre-move when allowPreMove transitions true→false (opponent just moved).
  // Using allowPreMove as the trigger avoids the race where disabled and allowPreMove change
  // in the same render and a pre-move queued just before the transition gets dropped.
  useEffect(() => {
    const wasAllowed = prevAllowPreMoveRef.current;
    prevAllowPreMoveRef.current = allowPreMove;

    if (wasAllowed && !allowPreMove) {
      // Opponent's turn just ended — either fire or discard the queued pre-move.
      const pm = preMoveRef.current;
      setPreMove(null);
      if (pm && !disabled) {
        // Re-validate against the new FEN (opponent's move may have made it illegal).
        const uci = resolveMove(fen, pm.slice(0, 2), pm.slice(2, 4));
        if (uci) onMoveRef.current(uci);
      }
    }
  }, [allowPreMove, disabled, fen]);

  const userColor = orientation === "white" ? "w" : "b";

  function handleSquareClick({ square }: { square: string }) {
    const disabled = disabledRef.current;
    const allowPreMove = allowPreMoveRef.current;
    // Pre-move mode: board is disabled but opponent is thinking
    if (disabled && allowPreMove) {
      if (selectedSquare) {
        if (square === selectedSquare) {
          setSelectedSquare(null);
          return;
        }
        // Validate pseudo-legality before accepting the pre-move
        const uci = resolvePreMove(fen, selectedSquare, square);
        if (uci) {
          setPreMove(uci);
          setSelectedSquare(null);
          return;
        }
        // Re-select if clicking another own piece
        const chess = new Chess(fen);
        const clicked = chess.get(square as Parameters<typeof chess.get>[0]);
        if (clicked?.color === userColor) {
          setSelectedSquare(square);
        } else {
          setSelectedSquare(null);
        }
      } else {
        const chess = new Chess(fen);
        const piece = chess.get(square as Parameters<typeof chess.get>[0]);
        if (piece?.color === userColor) setSelectedSquare(square);
      }
      return;
    }

    if (disabled) {
      triggerShake();
      return;
    }

    if (selectedSquare) {
      const uci = resolveMove(fen, selectedSquare, square);
      if (uci) {
        setSelectedSquare(null);
        onMove(uci);
        return;
      }
      const chess = new Chess(fen);
      const clicked = chess.get(square as Parameters<typeof chess.get>[0]);
      const turn = chess.turn();
      if (clicked && clicked.color === turn) {
        setSelectedSquare(square);
      } else {
        setSelectedSquare(null);
      }
      return;
    }

    const chess = new Chess(fen);
    const piece = chess.get(square as Parameters<typeof chess.get>[0]);
    const turn = chess.turn();
    if (piece && piece.color === turn) {
      setSelectedSquare(square);
    }
  }

  function handleDrop({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean {
    if (!targetSquare) return false;
    const disabled = disabledRef.current;
    const allowPreMove = allowPreMoveRef.current;

    // Pre-move mode: validate pseudo-legality before accepting
    if (disabled && allowPreMove) {
      const uci = resolvePreMove(fen, sourceSquare, targetSquare);
      if (uci) {
        setPreMove(uci);
        setSelectedSquare(null);
        return true;
      }
      return false;
    }

    if (disabled) {
      triggerShake();
      return false;
    }
    setSelectedSquare(null);
    const uci = resolveMove(fen, sourceSquare, targetSquare);
    if (!uci) {
      triggerShake();
      return false;
    }
    onMove(uci);
    return true;
  }

  function handleRightClick() {
    setPreMove(null);
    setSelectedSquare(null);
  }

  // Build square highlights
  const customSquareStyles: Record<string, React.CSSProperties> = {};
  if (hintMove) {
    const hintStyle = { backgroundColor: "rgba(100, 180, 255, 0.55)" };
    customSquareStyles[hintMove.slice(0, 2)] = hintStyle;
    customSquareStyles[hintMove.slice(2, 4)] = hintStyle;
  }
  if (preMoveDisplay) {
    const preMoveStyle = { backgroundColor: "rgba(220, 50, 50, 0.65)" };
    customSquareStyles[preMoveDisplay.slice(0, 2)] = preMoveStyle;
    customSquareStyles[preMoveDisplay.slice(2, 4)] = preMoveStyle;
  }
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { backgroundColor: "rgba(255, 255, 0, 0.4)" };
    if (!disabled) {
      // Normal mode: show legal destinations
      const chess = new Chess(fen);
      chess.moves({ verbose: true, square: selectedSquare as Parameters<typeof chess.moves>[0]["square"] }).forEach((m) => {
        customSquareStyles[m.to] = { backgroundColor: "rgba(0, 200, 0, 0.25)" };
      });
    } else if (allowPreMove) {
      // Pre-move mode: show pseudo-legal destinations (flipped color)
      const parts = fen.split(" ");
      parts[1] = parts[1] === "w" ? "b" : "w";
      parts[3] = "-";
      try {
        const chess = new Chess(parts.join(" "));
        chess.moves({ verbose: true, square: selectedSquare as Parameters<typeof chess.moves>[0]["square"] }).forEach((m) => {
          customSquareStyles[m.to] = { backgroundColor: "rgba(0, 200, 0, 0.25)" };
        });
      } catch { /* ignore invalid FEN */ }
    }
  }

  return (
    <div className={`${styles.wrapper}${shaking ? ` ${styles.shake}` : ""}`}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          boardStyle: { borderRadius: "4px" },
          onPieceDrop: handleDrop,
          onSquareClick: handleSquareClick,
          onSquareRightClick: handleRightClick,
          squareStyles: customSquareStyles,
          dropSquareStyle: { boxShadow: "inset 0 0 0 3px rgba(100, 180, 255, 0.8)" },
          animationDurationInMs: 150,
        }}
      />
    </div>
  );
}
