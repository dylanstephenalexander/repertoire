import { apiFetch } from "./client";
import type { OpeningSummary } from "../types";

export function fetchOpenings(): Promise<OpeningSummary[]> {
  return apiFetch<OpeningSummary[]>("/openings");
}
