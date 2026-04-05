import { apiFetch } from "./client";
import type { EvalResponse } from "../types";

export function fetchEval(fen: string): Promise<EvalResponse> {
  return apiFetch<EvalResponse>("/analysis/eval", {
    method: "POST",
    body: JSON.stringify({ fen }),
  });
}
