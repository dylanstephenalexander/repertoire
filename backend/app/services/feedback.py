from app.models.feedback import AnalysisLine, Feedback

ALTERNATIVE_THRESHOLD_CP = 25
BLUNDER_THRESHOLD_CP = 150


def _quality(cp_loss: int) -> str:
    if cp_loss <= ALTERNATIVE_THRESHOLD_CP:
        return "alternative"
    if cp_loss >= BLUNDER_THRESHOLD_CP:
        return "blunder"
    return "mistake"


def _format_lines(lines: list[AnalysisLine] | None, skill_level: str) -> str | None:
    """Format top lines for inclusion in explanation text (advanced only)."""
    if not lines or skill_level == "beginner":
        return None
    parts = [f"{l.move_san} ({'+' if l.cp >= 0 else ''}{l.cp / 100:.1f})" for l in lines[:3]]
    return ", ".join(parts)


def build_correct_feedback(skill_level: str, move_san: str) -> Feedback:
    explanations = {
        "beginner":     f"Great move! {move_san} follows the main line.",
        "intermediate": f"{move_san} is the mainline move.",
        "advanced":     f"{move_san} — mainline.",
    }
    return Feedback(
        quality="correct",
        explanation=explanations.get(skill_level, explanations["intermediate"]),
    )


def build_alternative_feedback(
    skill_level: str,
    played_san: str,
    mainline_san: str,
    cp_loss: int,
    lines: list[AnalysisLine] | None = None,
) -> Feedback:
    lines_str = _format_lines(lines, skill_level)
    explanations = {
        "beginner": (
            f"That works! The main line was {mainline_san}, "
            f"but {played_san} is totally fine too."
        ),
        "intermediate": (
            f"Off book, but solid. Mainline was {mainline_san}. "
            f"Centipawn loss: {cp_loss}."
            + (f" Top moves: {lines_str}." if lines_str else "")
        ),
        "advanced": (
            f"Deviation from theory. Mainline: {mainline_san}. Eval delta: -{cp_loss} cp."
            + (f" Top candidates: {lines_str}." if lines_str else "")
        ),
    }
    return Feedback(
        quality="alternative",
        explanation=explanations.get(skill_level, explanations["intermediate"]),
        centipawn_loss=cp_loss,
        lines=lines,
    )


def build_mistake_feedback(
    skill_level: str,
    played_san: str,
    best_san: str,
    cp_loss: int,
    lines: list[AnalysisLine] | None = None,
) -> Feedback:
    quality = _quality(cp_loss)
    lines_str = _format_lines(lines, skill_level)

    explanations = {
        "beginner": {
            "mistake": (
                f"{played_san} gives your opponent a small advantage. "
                f"Try {best_san} instead."
            ),
            "blunder": (
                f"Oops! {played_san} is a big mistake — it lets your opponent take a "
                f"significant advantage. {best_san} was the right move."
            ),
        },
        "intermediate": {
            "mistake": (
                f"{played_san} is inaccurate (-{cp_loss} cp). Best was {best_san}."
                + (f" Top moves: {lines_str}." if lines_str else "")
            ),
            "blunder": (
                f"{played_san} is a blunder (-{cp_loss} cp). Best was {best_san}."
                + (f" Top moves: {lines_str}." if lines_str else "")
            ),
        },
        "advanced": {
            "mistake": (
                f"Inaccuracy: {played_san}. Best: {best_san} (-{cp_loss} cp)."
                + (f" Candidates: {lines_str}." if lines_str else "")
            ),
            "blunder": (
                f"Blunder: {played_san}. Best: {best_san} (-{cp_loss} cp)."
                + (f" Candidates: {lines_str}." if lines_str else "")
            ),
        },
    }
    level_map = explanations.get(skill_level, explanations["intermediate"])
    explanation = level_map.get(quality, level_map["mistake"])
    return Feedback(
        quality=quality,
        explanation=explanation,
        centipawn_loss=cp_loss,
        lines=lines,
    )
