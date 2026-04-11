import { defaultPieces } from "react-chessboard";
import styles from "./Board.module.css";

interface PromotionPickerProps {
  color: "w" | "b";
  onSelect: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
}

const PROMOTION_PIECES = [
  { key: "q" as const, label: "Queen" },
  { key: "r" as const, label: "Rook" },
  { key: "b" as const, label: "Bishop" },
  { key: "n" as const, label: "Knight" },
];

export function PromotionPicker({ color, onSelect, onCancel }: PromotionPickerProps) {
  return (
    <div className={styles.promotionOverlay} onMouseDown={onCancel}>
      <div className={styles.promotionModal} onMouseDown={(e) => e.stopPropagation()}>
        <button
          className={styles.promotionClose}
          onClick={onCancel}
          aria-label="Cancel promotion"
        >
          ✕
        </button>
        <div className={styles.promotionGrid}>
          {PROMOTION_PIECES.map(({ key, label }) => {
            const pieceKey = `${color}${key.toUpperCase()}` as keyof typeof defaultPieces;
            const PieceSvg = defaultPieces[pieceKey];
            return (
              <button
                key={key}
                className={styles.promotionPieceBtn}
                onClick={() => onSelect(key)}
                aria-label={`Promote to ${label}`}
              >
                <PieceSvg svgStyle={{ width: "100%", height: "100%" }} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
