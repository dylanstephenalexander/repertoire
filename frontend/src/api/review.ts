import { apiFetch } from "./client";
import type { GameSummary, ReviewResponse } from "../types";

export interface FetchGamesParams {
  username: string;
  source: "chess.com" | "lichess";
  year?: number;
  month?: number;
  count?: number;
}

export function fetchGames(params: FetchGamesParams): Promise<GameSummary[]> {
  const query = new URLSearchParams({ username: params.username, source: params.source });
  if (params.year != null) query.set("year", String(params.year));
  if (params.month != null) query.set("month", String(params.month));
  if (params.count != null) query.set("count", String(params.count));
  return apiFetch<GameSummary[]>(`/review/games?${query}`);
}

export function analyseGame(pgn: string, signal?: AbortSignal): Promise<ReviewResponse> {
  return apiFetch<ReviewResponse>("/review/analyse", {
    method: "POST",
    body: JSON.stringify({ pgn }),
    signal,
  });
}
