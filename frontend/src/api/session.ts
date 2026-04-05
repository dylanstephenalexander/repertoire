import { apiFetch } from "./client";
import type {
  MoveResponse,
  OpponentMoveResponse,
  SessionStartResponse,
} from "../types";

export interface SessionStartParams {
  opening_id: string;
  variation_id: string;
  color: "white" | "black";
  mode: "study";
  skill_level: string;
}

export function startSession(
  params: SessionStartParams
): Promise<SessionStartResponse> {
  return apiFetch<SessionStartResponse>("/session/start", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function sendMove(
  sessionId: string,
  uciMove: string
): Promise<MoveResponse> {
  return apiFetch<MoveResponse>(`/session/${sessionId}/move`, {
    method: "POST",
    body: JSON.stringify({ uci_move: uciMove }),
  });
}

export function fetchOpponentMove(
  sessionId: string
): Promise<OpponentMoveResponse> {
  return apiFetch<OpponentMoveResponse>(`/session/${sessionId}/opponent_move`, {
    method: "POST",
  });
}
