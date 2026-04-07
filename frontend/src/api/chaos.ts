import { apiFetch } from "./client";
import type {
  ChaosStartResponse,
  ChaosMoveResponse,
  ChaosOpponentMoveResponse,
  EngineStatusResponse,
  ExplanationResponse,
} from "../types";

export type { ChaosStartResponse, ChaosMoveResponse, ChaosOpponentMoveResponse };

export interface ChaosStartParams {
  color: "white" | "black" | "random";
  elo_band: number;
}

export function fetchEngineStatus(): Promise<EngineStatusResponse> {
  return apiFetch<EngineStatusResponse>("/chaos/engine_status");
}

export function startChaos(params: ChaosStartParams): Promise<ChaosStartResponse> {
  return apiFetch<ChaosStartResponse>("/chaos/start", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function sendChaosMove(
  sessionId: string,
  uciMove: string,
  feedbackEnabled: boolean,
): Promise<ChaosMoveResponse> {
  return apiFetch<ChaosMoveResponse>(`/chaos/${sessionId}/move`, {
    method: "POST",
    body: JSON.stringify({ uci_move: uciMove, feedback_enabled: feedbackEnabled }),
  });
}

export function fetchChaosOpponentMove(sessionId: string): Promise<ChaosOpponentMoveResponse> {
  return apiFetch<ChaosOpponentMoveResponse>(`/chaos/${sessionId}/opponent_move`, {
    method: "POST",
  });
}

export function fetchChaosExplanation(sessionId: string): Promise<ExplanationResponse> {
  return apiFetch<ExplanationResponse>(`/chaos/${sessionId}/explanation`);
}
