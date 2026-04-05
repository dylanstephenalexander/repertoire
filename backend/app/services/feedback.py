from app.models.feedback import Feedback

# Centipawn loss threshold below which an off-tree move is "fine"
ALTERNATIVE_THRESHOLD_CP = 25

# Blunder starts here (roughly)
BLUNDER_THRESHOLD_CP = 150


def _quality(cp_loss: int) -> str:
    if cp_loss <= ALTERNATIVE_THRESHOLD_CP:
        return "alternative"
    if cp_loss >= BLUNDER_THRESHOLD_CP:
        return "blunder"
    return "mistake"


def build_correct_feedback(skill_level: str, move_san: str) -> Feedback:
    explanations = {
        "beginner": f"Great move! {move_san} follows the main line.",
        "intermediate": f"{move_san} is the mainline move.",
        "advanced": f"{move_san} — mainline.",
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
) -> Feedback:
    explanations = {
        "beginner": (
            f"That works! The main line was {mainline_san}, but {played_san} is totally fine too."
        ),
        "intermediate": (
            f"Off book, but solid. Mainline was {mainline_san}. "
            f"Centipawn loss: {cp_loss}."
        ),
        "advanced": (
            f"Deviation from theory. Mainline: {mainline_san}. "
            f"Eval delta: -{cp_loss} cp."
        ),
    }
    return Feedback(
        quality="alternative",
        explanation=explanations.get(skill_level, explanations["intermediate"]),
        centipawn_loss=cp_loss,
        best_move=mainline_san,
    )


def build_mistake_feedback(
    skill_level: str,
    played_san: str,
    best_san: str,
    cp_loss: int,
) -> Feedback:
    quality = _quality(cp_loss)
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
            "mistake": f"{played_san} is inaccurate (-{cp_loss} cp). Best was {best_san}.",
            "blunder": f"{played_san} is a blunder (-{cp_loss} cp). Best was {best_san}.",
        },
        "advanced": {
            "mistake": f"Inaccuracy: {played_san}. Best: {best_san} (-{cp_loss} cp).",
            "blunder": f"Blunder: {played_san}. Best: {best_san} (-{cp_loss} cp).",
        },
    }
    level_map = explanations.get(skill_level, explanations["intermediate"])
    explanation = level_map.get(quality, level_map["mistake"])
    return Feedback(
        quality=quality,
        explanation=explanation,
        centipawn_loss=cp_loss,
        best_move=best_san,
    )
