import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import styles from "./Board.module.css";

interface BoardProps {
  fen: string;
  orientation: "white" | "black";
  onMove: (uciMove: string) => void;
  disabled: boolean;
}

export function Board({ fen, orientation, onMove, disabled }: BoardProps) {
  return (
    <div className={styles.wrapper}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          boardStyle: { borderRadius: "4px" },
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (disabled || !targetSquare) return false;

            const chess = new Chess(fen);
            const moves = chess.moves({ verbose: true });
            const match = moves.find(
              (m) => m.from === sourceSquare && m.to === targetSquare
            );
            if (!match) return false;

            const uci = match.promotion
              ? `${sourceSquare}${targetSquare}${match.promotion}`
              : `${sourceSquare}${targetSquare}`;

            onMove(uci);
            return true;
          },
        }}
      />
    </div>
  );
}
