import { apiFetch } from "./client";
import type {
  ExplanationResponse,
  MoveResponse,
  OpponentMoveResponse,
  SessionStartResponse,
} from "../types";

export interface SessionStartParams {
  opening_id: string;
  variation_id: string;
  color: "white" | "black";
  mode: "study";
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

export function fetchHint(sessionId: string): Promise<{ move_san: string; move_uci: string }> {
  return apiFetch(`/session/${sessionId}/hint`);
}

export function fetchExplanation(sessionId: string): Promise<ExplanationResponse> {
  return apiFetch<ExplanationResponse>(`/session/${sessionId}/explanation`);
}

export function deleteSession(sessionId: string): void {
  apiFetch(`/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
}
