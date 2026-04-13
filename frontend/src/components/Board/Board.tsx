import { useEffect, useCallback, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import styles from "./Board.module.css";
import { PromotionPicker } from "./PromotionPicker";
import { type BoardStyle } from "../../themes";

interface BoardProps {
  fen: string;
  orientation: "white" | "black";
  onMove: (uciMove: string) => void;
  disabled: boolean;
  allowPreMove?: boolean;
  hintMove?: string; // UCI move to highlight (from + to squares) when a hint is active
  boardStyle: BoardStyle;
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
    // Always promote to queen as fallback — caller should intercept before this for picker
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
    const rookFile = to[0];
    const rank = from[1];
    const castleTo = rookFile > "e" ? `g${rank}` : `c${rank}`;
    const castle = legalMoves.find((m) => m.from === from && m.to === castleTo);
    if (castle) return `${from}${castleTo}`;
  }

  return null;
}

/** Returns true if moving from→to in the given FEN is a pawn promotion. */
export function isPromotionMove(fen: string, from: string, to: string): boolean {
  try {
    const chess = new Chess(fen);
    return chess.moves({ verbose: true }).some(
      (m) => m.from === from && m.to === to && !!m.promotion
    );
  } catch {
    return false;
  }
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

/** Returns true if from→to is a promotion move for the pre-moving side. */
export function isPromotionPreMove(fen: string, from: string, to: string): boolean {
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  try {
    return isPromotionMove(parts.join(" "), from, to);
  } catch {
    return false;
  }
}

type PendingPromotion = {
  from: string;
  to: string;
  color: "w" | "b";
  isPreMove: boolean;
};

export function Board({ fen, orientation, onMove, disabled, allowPreMove = false, hintMove, boardStyle }: BoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [preMoveDisplay, setPreMoveDisplay] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
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
  useEffect(() => {
    const wasAllowed = prevAllowPreMoveRef.current;
    prevAllowPreMoveRef.current = allowPreMove;

    if (wasAllowed && !allowPreMove) {
      const pm = preMoveRef.current;
      setPreMove(null);
      if (pm && !disabled) {
        if (pm.length === 5) {
          // Promotion pre-move: verify the base move is still legal, preserve user's piece choice
          const base = resolveMove(fen, pm.slice(0, 2), pm.slice(2, 4));
          if (base) onMoveRef.current(pm);
        } else {
          const uci = resolveMove(fen, pm.slice(0, 2), pm.slice(2, 4));
          if (uci) onMoveRef.current(uci);
        }
      }
    }
  }, [allowPreMove, disabled, fen]);

  const userColor = orientation === "white" ? "w" : "b";

  function handlePromotionSelect(piece: "q" | "r" | "b" | "n") {
    if (!pendingPromotion) return;
    const uci = `${pendingPromotion.from}${pendingPromotion.to}${piece}`;
    // Check allowPreMove at pick-time, not at queue-time. If the opponent already
    // finished moving while the picker was open, fire as a normal move instead of
    // storing a pre-move that will never trigger.
    if (pendingPromotion.isPreMove && allowPreMoveRef.current) {
      setPreMove(uci);
    } else {
      onMove(uci);
    }
    setPendingPromotion(null);
  }

  function handlePromotionCancel() {
    setPendingPromotion(null);
  }

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
        if (isPromotionPreMove(fen, selectedSquare, square)) {
          const chess = new Chess(fen);
          const piece = chess.get(selectedSquare as Parameters<typeof chess.get>[0]);
          setPendingPromotion({ from: selectedSquare, to: square, color: piece!.color, isPreMove: true });
          setSelectedSquare(null);
          return;
        }
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
      if (isPromotionMove(fen, selectedSquare, square)) {
        const chess = new Chess(fen);
        const piece = chess.get(selectedSquare as Parameters<typeof chess.get>[0]);
        setPendingPromotion({ from: selectedSquare, to: square, color: piece!.color, isPreMove: false });
        setSelectedSquare(null);
        return;
      }
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
      if (isPromotionPreMove(fen, sourceSquare, targetSquare)) {
        const chess = new Chess(fen);
        const piece = chess.get(sourceSquare as Parameters<typeof chess.get>[0]);
        setPendingPromotion({ from: sourceSquare, to: targetSquare, color: piece!.color, isPreMove: true });
        setSelectedSquare(null);
        return true;
      }
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

    if (isPromotionMove(fen, sourceSquare, targetSquare)) {
      const chess = new Chess(fen);
      const piece = chess.get(sourceSquare as Parameters<typeof chess.get>[0]);
      setPendingPromotion({ from: sourceSquare, to: targetSquare, color: piece!.color, isPreMove: false });
      return true;
    }

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
    setPendingPromotion(null);
  }

  // Build square highlights from theme board style
  const customSquareStyles: Record<string, React.CSSProperties> = {};
  if (hintMove) {
    const hintStyle = { backgroundColor: boardStyle.hint };
    customSquareStyles[hintMove.slice(0, 2)] = hintStyle;
    customSquareStyles[hintMove.slice(2, 4)] = hintStyle;
  }
  if (preMoveDisplay) {
    const preMoveStyle = { backgroundColor: boardStyle.premove };
    customSquareStyles[preMoveDisplay.slice(0, 2)] = preMoveStyle;
    customSquareStyles[preMoveDisplay.slice(2, 4)] = preMoveStyle;
  }
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { backgroundColor: boardStyle.selected };
    if (!disabled) {
      // Normal mode: show legal destinations
      const chess = new Chess(fen);
      chess.moves({ verbose: true, square: selectedSquare as Parameters<typeof chess.moves>[0]["square"] }).forEach((m) => {
        customSquareStyles[m.to] = { backgroundColor: boardStyle.legalDest };
      });
    } else if (allowPreMove) {
      // Pre-move mode: show pseudo-legal destinations (flipped color)
      const parts = fen.split(" ");
      parts[1] = parts[1] === "w" ? "b" : "w";
      parts[3] = "-";
      try {
        const chess = new Chess(parts.join(" "));
        chess.moves({ verbose: true, square: selectedSquare as Parameters<typeof chess.moves>[0]["square"] }).forEach((m) => {
          customSquareStyles[m.to] = { backgroundColor: boardStyle.legalDest };
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
          darkSquareStyle: { backgroundColor: boardStyle.darkSquare },
          lightSquareStyle: { backgroundColor: boardStyle.lightSquare },
          onPieceDrop: handleDrop,
          onSquareClick: handleSquareClick,
          onSquareRightClick: handleRightClick,
          squareStyles: customSquareStyles,
          dropSquareStyle: { boxShadow: `inset 0 0 0 3px ${boardStyle.dropTarget}` },
          animationDurationInMs: 150,
        }}
      />
      {pendingPromotion && (
        <PromotionPicker
          color={pendingPromotion.color}
          onSelect={handlePromotionSelect}
          onCancel={handlePromotionCancel}
        />
      )}
    </div>
  );
}
