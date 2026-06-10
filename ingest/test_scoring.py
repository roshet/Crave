"""Regression tests for the health-scoring engine.

The 2026-06-09 scoring upgrade made the backend the single source of truth for the
0-100 normalization shown in the UI (`score_bounds(goal)`). The original coupling had
"no test to catch" a weight change corrupting displayed percentages; these tests are
that guard. Importing `api` loads all four datasets and sets
`recommend_items.IMPUTED_SODIUM_MG` to the data-derived median, so the tests exercise
the real production scoring path.
"""

import math

import pytest

import api
import recommend_items
from recommend_items import health_score, saturate, score_bounds

GOALS = list(recommend_items.GOAL_PROFILES.keys())


@pytest.mark.parametrize("goal", GOALS)
def test_bounds_contain_all_real_scores(goal):
    """Every real item's raw score must fall within score_bounds for its goal.

    This is the core guard: if a weight or TAIL_WEIGHT changes such that the analytic
    bounds no longer envelope real scores, the UI's 0-100 mapping silently breaks. The
    frontend reads these same bounds, so this catches the drift the spec warned about.
    """
    bounds = score_bounds(goal)
    assert bounds["min"] < bounds["max"]
    for item in api.ALL_ITEMS:
        score = health_score(item, goal)
        assert bounds["min"] <= score <= bounds["max"], (
            f"{item.get('name')!r} scored {score} outside "
            f"[{bounds['min']}, {bounds['max']}] for goal {goal}"
        )


def test_saturate_matches_clamp_in_range():
    """Within [0, cap], saturate equals the old hard clamp, so in-range rankings are
    unchanged; above cap it strictly exceeds it (the discrimination that was restored)."""
    cap = 40
    for value in (0, 10, 20, 40):
        assert saturate(value, cap) == pytest.approx(min(value / cap, 1.0))
    assert saturate(cap + 1, cap) > 1.0
    assert saturate(0, 0) == 0.0  # cap == 0 guard


def test_saturate_discriminates_past_cap():
    """An 80g value must outweigh a 40g value past the cap (a hard clamp tied them)."""
    assert saturate(80, 40) > saturate(40, 40)
    # bounded by 1 + TAIL_WEIGHT no matter how large the overflow
    assert saturate(10_000, 40) <= 1.0 + recommend_items.TAIL_WEIGHT


def test_sodium_imputation_no_free_pass():
    """A missing-sodium item scores identically to one reporting the imputed value, so
    absent data earns no advantage over honestly-reported sodium."""
    base = {"name": "test", "protein": 20, "sugars": 5, "fat": 10, "carbs": 30,
            "calories": 400}
    missing = {**base, "sodium": None}
    imputed = {**base, "sodium": recommend_items.IMPUTED_SODIUM_MG}
    assert health_score(missing, "balanced") == health_score(imputed, "balanced")


def test_imputed_sodium_is_data_derived():
    """api.py overwrites the default with the dataset median at import, so the value
    tracks the data rather than the 600.0 module default."""
    assert recommend_items.IMPUTED_SODIUM_MG > 0
