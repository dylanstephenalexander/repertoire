from app.models.feedback import AnalysisLine
from app.services.feedback import (
    ALTERNATIVE_THRESHOLD_CP,
    BLUNDER_THRESHOLD_CP,
    build_alternative_feedback,
    build_correct_feedback,
    build_mistake_feedback,
)

SAMPLE_LINES = [
    AnalysisLine(move_uci="e2e4", move_san="e4", cp=30),
    AnalysisLine(move_uci="d2d4", move_san="d4", cp=25),
    AnalysisLine(move_uci="g1f3", move_san="Nf3", cp=20),
]


def test_correct_feedback_quality():
    fb = build_correct_feedback("e4")
    assert fb.quality == "correct"
    assert fb.centipawn_loss is None
    assert fb.lines is None


def test_alternative_feedback_quality():
    fb = build_alternative_feedback("d4", "e4", 10)
    assert fb.quality == "alternative"
    assert fb.centipawn_loss == 10


def test_alternative_feedback_mentions_mainline():
    fb = build_alternative_feedback("d4", "e4", 5)
    assert "e4" in fb.explanation


def test_mistake_feedback_quality():
    fb = build_mistake_feedback("h3", "e4", 80)
    assert fb.quality == "mistake"
    assert fb.centipawn_loss == 80


def test_blunder_feedback_quality():
    fb = build_mistake_feedback("h3", "e4", BLUNDER_THRESHOLD_CP + 50)
    assert fb.quality == "blunder"


def test_mistake_boundary():
    fb = build_mistake_feedback("h3", "e4", ALTERNATIVE_THRESHOLD_CP + 1)
    assert fb.quality == "mistake"


def test_blunder_boundary():
    fb = build_mistake_feedback("h3", "e4", BLUNDER_THRESHOLD_CP - 1)
    assert fb.quality == "mistake"


def test_mistake_explanation_includes_cp():
    fb = build_mistake_feedback("h3", "e4", 80)
    assert "80" in fb.explanation


def test_mistake_explanation_mentions_best_move():
    fb = build_mistake_feedback("h3", "e4", 80)
    assert "e4" in fb.explanation


def test_lines_attached_to_feedback():
    fb = build_mistake_feedback("h3", "e4", 80, lines=SAMPLE_LINES)
    assert fb.lines == SAMPLE_LINES
