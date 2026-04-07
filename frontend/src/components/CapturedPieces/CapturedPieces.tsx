import { defaultPieces } from "react-chessboard";
import styles from "./CapturedPieces.module.css";

const PIECE_VALUES: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };

// react-chessboard piece keys: "wQ", "bP", etc.
// captured-by-white = black pieces (b prefix); captured-by-black = white pieces (w prefix)
const PIECE_KEY: Record<string, string> = {
  Q: "wQ", R: "wR", B: "wB", N: "wN", P: "wP",
  q: "bQ", r: "bR", b: "bB", n: "bN", p: "bP",
};

export function computeCaptured(fen: string) {
  const start: Record<string, number> = {
    P: 8, N: 2, B: 2, R: 2, Q: 1,
    p: 8, n: 2, b: 2, r: 2, q: 1,
  };
  const current: Record<string, number> = {};
  for (const ch of fen.split(" ")[0]) {
    if (/[PNBRQKpnbrqk]/.test(ch)) current[ch] = (current[ch] ?? 0) + 1;
  }

  const capturedByWhite: string[] = []; // black pieces white took
  const capturedByBlack: string[] = []; // white pieces black took

  for (const [piece, startCount] of Object.entries(start)) {
    const missing = Math.max(0, startCount - (current[piece] ?? 0));
    const isBlack = piece === piece.toLowerCase();
    for (let i = 0; i < missing; i++) {
      (isBlack ? capturedByWhite : capturedByBlack).push(piece);
    }
  }

  const byValue = (a: string, b: string) => (PIECE_VALUES[b] ?? 0) - (PIECE_VALUES[a] ?? 0);
  capturedByWhite.sort(byValue);
  capturedByBlack.sort(byValue);

  const whiteAdv =
    capturedByWhite.reduce((s, p) => s + (PIECE_VALUES[p.toLowerCase()] ?? 0), 0) -
    capturedByBlack.reduce((s, p) => s + (PIECE_VALUES[p.toLowerCase()] ?? 0), 0);

  return { capturedByWhite, capturedByBlack, whiteAdv };
}

interface CapturedPiecesProps {
  fen: string;
  color: "white" | "black"; // the player whose captures are shown
}

export function CapturedPieces({ fen, color }: CapturedPiecesProps) {
  const { capturedByWhite, capturedByBlack, whiteAdv } = computeCaptured(fen);
  const pieces = color === "white" ? capturedByWhite : capturedByBlack;
  const adv = color === "white" ? whiteAdv : -whiteAdv;

  return (
    <div className={styles.strip}>
      <span className={styles.pieces}>
        {pieces.map((p, i) => {
          const key = PIECE_KEY[p];
          const PieceSvg = key ? defaultPieces[key] : null;
          return PieceSvg ? (
            <span key={i} className={styles.piece}>
              <PieceSvg />
            </span>
          ) : null;
        })}
      </span>
      {adv > 0 && <span className={styles.adv}>+{adv}</span>}
    </div>
  );
}
