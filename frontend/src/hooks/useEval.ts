import { useEffect, useState } from "react";
import { fetchEval } from "../api/analysis";

interface EvalState {
  evalCp: number | null;
  loading: boolean;
}

export function useEval(fen: string | null): EvalState {
  const [state, setState] = useState<EvalState>({ evalCp: null, loading: false });

  useEffect(() => {
    if (!fen) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      setState({ evalCp: null, loading: true });

      fetchEval(fen)
        .then((resp) => {
          if (!cancelled) {
            setState({ evalCp: resp.eval_cp, loading: false });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setState({ evalCp: null, loading: false });
          }
        });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fen]);

  return state;
}
