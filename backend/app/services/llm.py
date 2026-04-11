import asyncio
import logging
import os
from typing import Protocol, runtime_checkable

from google import genai

logger = logging.getLogger(__name__)


@runtime_checkable
class LLMProvider(Protocol):
    async def explain(self, prompt: str) -> str: ...


class GeminiProvider:
    def __init__(self, api_key: str, model: str):
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def explain(self, prompt: str) -> str:
        response = await asyncio.wait_for(
            self._client.aio.models.generate_content(
                model=self._model,
                contents=prompt,
            ),
            timeout=8.0,
        )
        return response.text.strip()


_provider: LLMProvider | None = None


def init_provider() -> None:
    global _provider
    api_key = os.environ.get("GEMINI_API_KEY", "")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    if api_key:
        _provider = GeminiProvider(api_key, model)
        logger.info("LLM provider: Gemini (%s)", model)
    else:
        logger.info("LLM provider: none (GEMINI_API_KEY not set — using templates)")


def set_provider(provider: LLMProvider | None) -> None:
    """Override provider — for testing."""
    global _provider
    _provider = provider


async def get_explanation(
    pre_move_fen: str,
    played_san: str,
    best_san: str,
    cp_loss: int,
    tactical_facts: list[str],
) -> tuple[str | None, str]:
    """
    Returns (explanation, llm_debug).
    explanation is None if no provider or call failed — caller falls back to template.
    llm_debug is always a human-readable string for the debug panel.
    """
    if _provider is None:
        return None, "No provider configured (GEMINI_API_KEY not set)"
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

    if tactical_facts:
        facts_section = (
            "Verified facts about this position:\n"
            + "\n".join(f"- {f}" for f in tactical_facts)
            + "\n\nBase your explanation on these facts. "
            "Do not mention threats, captures, or pieces not listed above."
        )
    else:
        facts_section = "No concrete tactical facts were detected — give an honest general explanation."

    prompt = (
        f"FEN: {pre_move_fen}\n"
        f"Played: {played_san} | Best: {best_san} | Loss: {cp_loss}cp\n\n"
        f"{facts_section}\n\n"
        f"In 1–2 sentences, explain the concrete reason {played_san} was bad. "
        f"Name the pieces and squares. State what the opponent does next.\n"
        f"Good: 'The knight on f6 is now undefended — Bxf6 wins a piece immediately.'\n"
        f"Bad: 'This move isn't the best and loses material.'"
    )

    try:
        logger.info("Gemini called. Prompt: %s", prompt)
        result = await _provider.explain(prompt)
        logger.info("Gemini response: %s", result)
        return result, f"{model} — OK\n\n{result}"
    except Exception as exc:
        logger.warning("Gemini call failed: %s: %s", type(exc).__name__, exc)
        summary = str(exc).split("{")[0].strip().rstrip(".") or type(exc).__name__
        return None, f"{model} — {summary}"
