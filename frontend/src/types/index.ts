export interface VariationSummary {
  id: string;
  name: string;
}

export interface OpeningSummary {
  id: string;
  name: string;
  color: "white" | "black";
  variations: VariationSummary[];
}

export interface AnalysisLine {
  move_uci: string;
  move_san: string;
  cp: number;
}

export interface Feedback {
  quality: "correct" | "alternative" | "mistake" | "blunder";
  explanation: string;
  centipawn_loss: number | null;
  lines: AnalysisLine[] | null;
}

export interface SessionStartResponse {
  session_id: string;
  fen: string;
  to_move: "white" | "black";
}

export interface MoveResponse {
  result: "correct" | "alternative" | "mistake" | "blunder";
  feedback: Feedback;
  fen: string;
  eval_cp: number | null;
}

export interface OpponentMoveResponse {
  uci_move: string;
  fen: string;
}

export interface EvalResponse {
  lines: AnalysisLine[];
  eval_cp: number | null;
  depth: number;
}
