import pytest

from app.services.feedback import (
    ALTERNATIVE_THRESHOLD_CP,
    BLUNDER_THRESHOLD_CP,
    build_alternative_feedback,
    build_correct_feedback,
    build_mistake_feedback,
)


def test_correct_feedback_quality():
    fb = build_correct_feedback("beginner", "e4")
    assert fb.quality == "correct"
    assert fb.centipawn_loss is None


def test_alternative_feedback_quality():
    fb = build_alternative_feedback("intermediate", "d4", "e4", 10)
    assert fb.quality == "alternative"
    assert fb.centipawn_loss == 10
    assert fb.best_move == "e4"


def test_alternative_feedback_mentions_mainline():
    fb = build_alternative_feedback("beginner", "d4", "e4", 5)
    assert "e4" in fb.explanation


def test_mistake_feedback_quality():
    fb = build_mistake_feedback("intermediate", "h3", "e4", 80)
    assert fb.quality == "mistake"
    assert fb.centipawn_loss == 80


def test_blunder_feedback_quality():
    fb = build_mistake_feedback("intermediate", "h3", "e4", BLUNDER_THRESHOLD_CP + 50)
    assert fb.quality == "blunder"


def test_mistake_boundary():
    """One cp above alternative threshold should be a mistake, not alternative."""
    fb = build_mistake_feedback("advanced", "h3", "e4", ALTERNATIVE_THRESHOLD_CP + 1)
    assert fb.quality == "mistake"


def test_blunder_boundary():
    """One cp below blunder threshold should still be a mistake."""
    fb = build_mistake_feedback("advanced", "h3", "e4", BLUNDER_THRESHOLD_CP - 1)
    assert fb.quality == "mistake"


def test_beginner_mistake_no_jargon():
    """Beginner explanations must not use cp/centipawn terminology."""
    fb = build_mistake_feedback("beginner", "h3", "e4", 100)
    assert "cp" not in fb.explanation
    assert "centipawn" not in fb.explanation.lower()


def test_beginner_blunder_no_jargon():
    fb = build_mistake_feedback("beginner", "h3", "e4", 300)
    assert "cp" not in fb.explanation
    assert "centipawn" not in fb.explanation.lower()


def test_advanced_mistake_includes_cp():
    fb = build_mistake_feedback("advanced", "h3", "e4", 80)
    assert "cp" in fb.explanation or "80" in fb.explanation
