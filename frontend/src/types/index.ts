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
  quality: "correct" | "alternative" | "mistake" | "blunder" | "checkmate" | "draw";
  explanation: string;
  centipawn_loss: number | null;
  lines: AnalysisLine[] | null;
  llm_explanation?: boolean;
}

export interface PositionEntry {
  fen: string;
  san: string | null;       // null for starting position
  feedback: Feedback | null; // null for opponent moves and starting position
  evalCp: number | null;    // stored when useEval resolves; null until then
}

export interface SessionStartResponse {
  session_id: string;
  fen: string;
  to_move: "white" | "black";
}

export interface MoveResponse {
  result: "correct" | "alternative" | "mistake" | "blunder" | "rejected";
  feedback: Feedback | null;
  fen: string;
  eval_cp: number | null;
  debug_msg: string | null;
}

export interface ExplanationResponse {
  explanation: string | null;
  llm_debug: string | null;
}

export interface OpponentMoveResponse {
  uci_move: string;
  fen: string;
  line_complete: boolean;
}

export interface EvalResponse {
  lines: AnalysisLine[];
  eval_cp: number | null;
  depth: number;
}

export interface GameSummary {
  url: string;
  pgn: string;
  white: string;
  black: string;
  result: string;
  date: string;
  time_class: string;
}

export interface EngineStatusResponse {
  lc0: boolean;
  maia_models: number[];
}

export interface ChaosStartResponse {
  session_id: string;
  fen: string;
  user_color: "white" | "black";
}

export interface ChaosMoveResponse {
  fen: string;
  feedback: Feedback | null;
  opening_name: string | null;
  in_theory: boolean;
  debug_msg: string | null;
}

export interface ChaosOpponentMoveResponse {
  uci_move: string;
  fen: string;
  opening_name: string | null;
  in_theory: boolean;
  opponent_move_time: number | null;
  opponent_engine: string | null;
}

export type MoveQuality = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface MoveAnnotation {
  move_number: number;
  color: "white" | "black";
  move_san: string;
  move_uci: string;
  quality: MoveQuality;
  cp_loss: number | null;
  best_move_san: string | null;
  explanation: string | null;
  fen_before: string;
  eval_cp: number | null;
}

export interface ReviewResponse {
  white: string;
  black: string;
  result: string;
  moves: MoveAnnotation[];
}
