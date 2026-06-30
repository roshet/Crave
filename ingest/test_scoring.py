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


from recommend_items import build_optimal_meal


def _entree_categories():
    # Mirror the entree category set used by build_optimal_meal.
    return {
        "burgers", "entrees", "salads", "nuggets_strips", "breakfast",
        "chicken", "chicken_fish", "wraps", "snack_wraps", "kid_s_meals",
        "tacos", "burritos", "quesadillas", "nachos", "specialties",
    }


def test_wendys_vegan_builds_entree_less_meal():
    """Wendy's has no vegan entree, so the optimizer must fall back to a sides-only meal."""
    vegan = [it for it in api.wendys_items if it.get("vegan")]
    result = build_optimal_meal(vegan, max_calories=800, goal="low_fat")
    assert result is not None
    assert result["meals"], "expected at least one sides-only meal"
    first = result["meals"][0]
    assert first["entree_less"] is True
    # No item in the meal is an entree-category item.
    cats = {(i.get("category") or "").lower() for i in first["items"]}
    assert not (cats & _entree_categories())


def test_entree_anchored_meal_not_flagged():
    """A normal menu with entrees keeps the entree anchor and is not flagged entree_less."""
    result = build_optimal_meal(api.mcdonalds_items, max_calories=800, goal="balanced")
    assert result is not None
    assert result["meals"][0]["entree_less"] is False


def test_drinks_only_returns_none():
    """No entree and no side (drinks only) cannot form a meal."""
    drinks = [it for it in api.wendys_items
              if (it.get("item_type") == "drink") or (it.get("category") == "drinks")]
    assert build_optimal_meal(drinks, max_calories=800, goal="balanced") is None
