from app.models.feedback import AnalysisLine, Feedback

ALTERNATIVE_THRESHOLD_CP = 25
BLUNDER_THRESHOLD_CP = 150


def _quality(cp_loss: int) -> str:
    if cp_loss <= ALTERNATIVE_THRESHOLD_CP:
        return "alternative"
    if cp_loss >= BLUNDER_THRESHOLD_CP:
        return "blunder"
    return "mistake"


def build_correct_feedback(move_san: str) -> Feedback:
    return Feedback(
        quality="correct",
        explanation=f"{move_san} is the mainline move.",
    )


def build_alternative_feedback(
    played_san: str,
    mainline_san: str,
    cp_loss: int,
    lines: list[AnalysisLine] | None = None,
) -> Feedback:
    return Feedback(
        quality="alternative",
        explanation=f"That works! The main line was {mainline_san}, but {played_san} is fine too.",
        centipawn_loss=cp_loss,
        lines=lines,
    )


def build_mistake_feedback(
    played_san: str,
    best_san: str,
    cp_loss: int,
    lines: list[AnalysisLine] | None = None,
) -> Feedback:
    quality = _quality(cp_loss)
    if quality == "blunder":
        explanation = f"{played_san} is a blunder (-{cp_loss} cp). Best was {best_san}."
    else:
        explanation = f"{played_san} is a mistake (-{cp_loss} cp). Best was {best_san}."
    return Feedback(
        quality=quality,
        explanation=explanation,
        centipawn_loss=cp_loss,
        lines=lines,
    )
