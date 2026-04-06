export type NotationMode = "notation" | "readable" | "both";

const PIECE_NAMES: Record<string, string> = {
  N: "knight",
  B: "bishop",
  R: "rook",
  Q: "queen",
  K: "king",
};

/**
 * Convert a single SAN token to plain English.
 * e.g. "Nf3" → "knight to F3", "exd5" → "pawn takes D5", "O-O" → "kingside castle"
 */
export function sanToEnglish(san: string): string {
  if (san === "O-O-O") return "queenside castle";
  if (san === "O-O") return "kingside castle";

  let s = san;

  const suffix = s.endsWith("#") ? " (checkmate)" : s.endsWith("+") ? " (check)" : "";
  if (suffix) s = s.slice(0, -1);

  let promotion = "";
  const eqIdx = s.indexOf("=");
  if (eqIdx !== -1) {
    const promPiece = PIECE_NAMES[s[eqIdx + 1]] ?? s[eqIdx + 1];
    promotion = ` promotes to ${promPiece}`;
    s = s.slice(0, eqIdx);
  }

  const isCapture = s.includes("x");
  s = s.replace("x", "");

  const piece = /^[NBRQK]/.test(s) ? PIECE_NAMES[s[0]] : "pawn";
  if (piece !== "pawn") s = s.slice(1);

  // s is now the destination square optionally prefixed by disambiguation (file/rank)
  const square = s.slice(-2);
  const file = square[0].toUpperCase();
  const rank = square[1];

  const action = isCapture ? "takes" : "to";
  return `${piece} ${action} ${file}${rank}${promotion}${suffix}`;
}

/**
 * SAN token pattern — conservative: only matches things that look like actual moves.
 * Castling handled separately; piece moves and pawn moves with optional disambiguation.
 */
const SAN_RE =
  /\b(O-O-O|O-O|[NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQK])?[+#]?|[a-h]x?[a-h][1-8](?:=[NBRQK])?[+#]?|[a-h][1-8](?:=[NBRQK])?[+#]?)\b/g;

/**
 * Replace SAN tokens in an explanation string according to the display mode.
 */
export function translateExplanation(text: string, mode: NotationMode): string {
  if (mode === "notation") return text;

  return text.replace(SAN_RE, (match) => {
    const english = sanToEnglish(match);
    if (mode === "readable") return english;
    // "both": "knight to F3 (Nf3)"
    return `${english} (${match})`;
  });
}
