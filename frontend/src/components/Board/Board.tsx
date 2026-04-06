import { useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import styles from "./Board.module.css";

interface BoardProps {
  fen: string;
  orientation: "white" | "black";
  onMove: (uciMove: string) => void;
  disabled: boolean;
}

/** Return the UCI move string if the drop is legal, or null. */
function resolveMove(
  fen: string,
  from: string,
  to: string
): string | null {
  const chess = new Chess(fen);
  const legalMoves = chess.moves({ verbose: true });

  // Direct match
  const direct = legalMoves.find((m) => m.from === from && m.to === to);
  if (direct) {
    return direct.promotion
      ? `${from}${to}${direct.promotion}`
      : `${from}${to}`;
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

export function Board({ fen, orientation, onMove, disabled }: BoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

  function handleSquareClick({ square }: { square: string }) {
    if (disabled) return;

    if (selectedSquare) {
      const uci = resolveMove(fen, selectedSquare, square);
      if (uci) {
        setSelectedSquare(null);
        onMove(uci);
        return;
      }
      // Clicked an invalid target — if it's one of our pieces, re-select it
      const chess = new Chess(fen);
      const clicked = chess.get(square as Parameters<typeof chess.get>[0]);
      const turn = chess.turn(); // 'w' or 'b'
      if (clicked && clicked.color === turn) {
        setSelectedSquare(square);
      } else {
        setSelectedSquare(null);
      }
      return;
    }

    // No piece selected yet — select if it's the side to move
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
    if (disabled || !targetSquare) return false;
    setSelectedSquare(null);
    const uci = resolveMove(fen, sourceSquare, targetSquare);
    if (!uci) return false;
    onMove(uci);
    return true;
  }

  // Highlight selected square
  const customSquareStyles: Record<string, React.CSSProperties> = {};
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { backgroundColor: "rgba(255, 255, 0, 0.4)" };
    // Highlight legal destinations
    const chess = new Chess(fen);
    chess.moves({ verbose: true, square: selectedSquare as Parameters<typeof chess.moves>[0]["square"] }).forEach((m) => {
      customSquareStyles[m.to] = { backgroundColor: "rgba(0, 200, 0, 0.25)" };
    });
  }

  return (
    <div className={styles.wrapper}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          boardStyle: { borderRadius: "4px" },
          onPieceDrop: handleDrop,
          onSquareClick: handleSquareClick,
          squareStyles: customSquareStyles,
          animationDurationInMs: 150,
        }}
      />
    </div>
  );
}
