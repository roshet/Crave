"""Endpoint + integration tests for the Crave API.

Complements test_scoring.py (pure scoring math) by exercising the HTTP layer through
FastAPI's TestClient against the real app — same data-loading path as production. Covers
happy paths, input validation (400/422), the optimizer's meal assembly + hard
constraints, and the /health probe.
"""

import pytest
from fastapi.testclient import TestClient

from api import app
from recommend_items import GOAL_CONSTRAINTS

client = TestClient(app)


# --- /health -----------------------------------------------------------------

def test_health_reports_loaded_data():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["items"] > 0
    # the four per-restaurant counts must sum to the total
    assert sum(body["restaurants"].values()) == body["items"]


# --- /recommend --------------------------------------------------------------

def test_recommend_happy_path():
    resp = client.get("/recommend", params={"goal": "balanced", "top_n": 5})
    assert resp.status_code == 200
    body = resp.json()
    assert "results" in body and "score_bounds" in body
    assert len(body["results"]) <= 5
    bounds = body["score_bounds"]
    assert bounds["min"] < bounds["max"]


def test_recommend_human_format_normalizes_carbs():
    """Frontend requests format=human; every item must expose a normalized `carbs`
    key (never the raw `carbohydrate`)."""
    resp = client.get("/recommend", params={"format": "human", "top_n": 5})
    assert resp.status_code == 200
    for item in resp.json()["results"]:
        assert "carbs" in item
        assert "carbohydrate" not in item


def test_recommend_items_carry_score_breakdown():
    """Each humanized item ships a `breakdown` powering the "Why this score" bars:
    a 6-term list whose points sum to the item's raw score."""
    resp = client.get("/recommend", params={"format": "human", "top_n": 5})
    assert resp.status_code == 200
    for item in resp.json()["results"]:
        bd = item["breakdown"]
        assert [t["key"] for t in bd] == [
            "protein", "sugars", "fat", "carbs", "sodium", "calories"
        ]
        for t in bd:
            assert {"key", "label", "value", "unit", "points"} <= t.keys()
        assert sum(t["points"] for t in bd) == pytest.approx(item["score"], abs=0.01)


def test_recommend_top_n_respected():
    resp = client.get("/recommend", params={"top_n": 3})
    assert resp.status_code == 200
    assert len(resp.json()["results"]) <= 3


def test_recommend_unknown_category_is_400():
    resp = client.get(
        "/recommend", params={"restaurant": "mcdonalds", "category": "does_not_exist"}
    )
    assert resp.status_code == 400


def test_recommend_valid_category_ok():
    # discover a real category for mcdonalds, then confirm it filters without error
    cats = client.get("/categories", params={"restaurant": "mcdonalds"}).json()["categories"]
    assert cats, "expected mcdonalds to have categories"
    resp = client.get(
        "/recommend", params={"restaurant": "mcdonalds", "category": cats[0]}
    )
    assert resp.status_code == 200


def test_recommend_rejects_bad_params():
    assert client.get("/recommend", params={"max_calories": 0}).status_code == 422
    assert client.get("/recommend", params={"top_n": 99}).status_code == 422
    assert client.get("/recommend", params={"goal": "bogus"}).status_code == 422
    assert client.get("/recommend", params={"restaurant": "subway"}).status_code == 422


# --- /optimize_meal ----------------------------------------------------------

def test_optimize_returns_meals_with_entree():
    resp = client.get("/optimize_meal", params={"restaurant": "mcdonalds"})
    assert resp.status_code == 200
    meals = resp.json()["meals"]
    assert 1 <= len(meals) <= 3
    for meal in meals:
        assert len(meal["items"]) >= 1  # at least an entree
        assert meal["total_calories"] <= 800  # default cap


def test_optimize_meals_carry_score_breakdown():
    """Each optimized meal ships a `breakdown` (per-nutrient contribution terms) whose
    points sum to the meal's total_score, powering the meal-card explainer."""
    resp = client.get("/optimize_meal", params={"restaurant": "mcdonalds"})
    assert resp.status_code == 200
    for meal in resp.json()["meals"]:
        bd = meal["breakdown"]
        assert [t["key"] for t in bd] == [
            "protein", "sugars", "fat", "carbs", "sodium", "calories"
        ]
        assert sum(t["points"] for t in bd) == pytest.approx(meal["total_score"], abs=0.05)


def test_optimize_high_protein_constraint_holds():
    """The high_protein hard floor (>=35g) must hold for every returned meal."""
    floor = GOAL_CONSTRAINTS["high_protein"]["min_protein"]
    resp = client.get(
        "/optimize_meal", params={"restaurant": "mcdonalds", "goal": "high_protein"}
    )
    assert resp.status_code == 200
    for meal in resp.json()["meals"]:
        total_protein = sum(i["protein"] for i in meal["items"])
        assert total_protein >= floor


def test_optimize_all_restaurants_aggregates_and_sorts():
    resp = client.get("/optimize_meal", params={"restaurant": "all"})
    assert resp.status_code == 200
    meals = resp.json()["meals"]
    assert len(meals) <= 3
    scores = [m["total_score"] for m in meals]
    assert scores == sorted(scores, reverse=True)


def test_optimize_impossible_constraint_returns_message_not_crash():
    resp = client.get(
        "/optimize_meal", params={"restaurant": "mcdonalds", "max_calories": 1}
    )
    assert resp.status_code == 200
    assert "message" in resp.json()  # graceful "No valid meal found", no 500


def test_optimize_chickfila_never_picks_catering():
    """The Chick-fil-A cleanup parked gallons/trays in a `catering` category that is
    in NO optimizer set, so multi-serve catering can never be built into a meal."""
    resp = client.get("/optimize_meal", params={"restaurant": "chickfila"})
    assert resp.status_code == 200
    for meal in resp.json()["meals"]:
        for item in meal["items"]:
            assert item.get("category") != "catering"


# --- data quality ------------------------------------------------------------

def test_chickfila_ice_junk_rows_removed():
    """The cleanup deleted non-food ice rows (scoop/bucket/bag/products) that the
    optimizer could otherwise surface as a meal component."""
    from api import chickfila_items

    ids = {i["item_id"] for i in chickfila_items}
    assert not (ids & {
        "chickfila_ice_scoop",
        "chickfila_ice_bucket_and_scoop",
        "chickfila_bag_of_ice",
        "chickfila_ice_products",
    })


def test_wendys_food_items_have_real_sodium():
    """Wendy's is now US menu data (build_wendys_us.py) with real sodium per item, so no
    Wendy's food item should fall back to the scoring engine's imputed median."""
    from api import wendys_items

    missing = [i["name"] for i in wendys_items
               if i.get("item_type") == "food" and i.get("sodium") is None]
    assert not missing, f"Wendy's food items lack sodium: {missing}"


def test_wendys_is_us_menu():
    """Guard the UK->US re-source: Dave's Single must read US (~590), not the old UK 524,
    and the US menu should span breakfast + drinks. Catches a generator/build regression."""
    from api import wendys_items

    by_name = {i["name"]: i for i in wendys_items}
    daves = by_name.get("Dave's Single")
    assert daves is not None, "Dave's Single missing (id used by shared-meal tests)"
    assert 560 <= daves["calories"] <= 620, f"Dave's Single not US calories: {daves['calories']}"

    cats = {i["category"] for i in wendys_items}
    assert {"burgers", "breakfast", "drinks"} <= cats, f"missing US categories: {cats}"


def test_burgerking_is_us_menu():
    """Guard the Track-D add: BK has a Whopper with sane US calories and spans burgers +
    drinks. Catches a generator/build regression. ids live in a fresh 7xxxxx range so they
    can't collide with McDonald's (~2xxxxx) or Taco Bell (6xxxxx) in ITEMS_BY_ID."""
    from api import burgerking_items

    by_name = {i["name"]: i for i in burgerking_items}
    whopper = by_name.get("Whopper")
    assert whopper is not None, "Whopper missing"
    assert 600 <= whopper["calories"] <= 750, f"Whopper not US calories: {whopper['calories']}"

    cats = {i["category"] for i in burgerking_items}
    assert {"burgers", "drinks"} <= cats, f"missing BK categories: {cats}"
    assert all(700000 <= i["item_id"] < 800000 for i in burgerking_items)


def test_optimize_burgerking_builds_a_meal():
    """BK maps onto existing optimizer categories (burgers entree, sides side, drinks), so a
    full entree+side+drink meal must be buildable for restaurant=burgerking."""
    resp = client.get("/optimize_meal", params={"restaurant": "burgerking", "max_calories": 1200})
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("meals"), "no BK meal returned"
    cats = {it.get("category") for it in body["meals"][0]["items"]}
    assert "drinks" in cats and len(body["meals"][0]["items"]) >= 2


# --- /categories -------------------------------------------------------------

def test_categories_returns_list():
    resp = client.get("/categories", params={"restaurant": "wendys"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["restaurant"] == "wendys"
    assert isinstance(body["categories"], list) and body["categories"]


# --- /items (shared-meal rehydration) ----------------------------------------

def test_items_round_trips_in_request_order():
    """Shared-meal links carry item_ids; /items must return them in the same order so
    the rehydrated meal matches what was shared. Mixes id types across restaurants."""
    ids = ["Dave's Single", "chickfila_spicy_chicken_biscuit", "600000"]
    resp = client.get("/items", params={"ids": ",".join(ids)})
    assert resp.status_code == 200
    returned = [str(i["item_id"]) for i in resp.json()["results"]]
    assert returned == ids


def test_items_resolves_wendys_string_id():
    """Wendy's ids are human names with spaces/apostrophes — must resolve as opaque
    strings, never coerced to int."""
    resp = client.get("/items", params={"ids": "Dave's Single"})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 1
    assert str(results[0]["item_id"]) == "Dave's Single"
    assert "carbs" in results[0]  # humanized, like /recommend?format=human


def test_items_skips_unknown_ids():
    """A link to a since-deleted item must still load the rest of the meal."""
    resp = client.get("/items", params={"ids": "Dave's Single,__nope__,600000"})
    assert resp.status_code == 200
    returned = [str(i["item_id"]) for i in resp.json()["results"]]
    assert returned == ["Dave's Single", "600000"]


def test_items_empty_ids_is_400():
    resp = client.get("/items", params={"ids": "  , "})
    assert resp.status_code == 400


def test_items_missing_ids_param_is_422():
    """`ids` is required, so omitting it is a FastAPI validation error."""
    resp = client.get("/items")
    assert resp.status_code == 422


# --- /score_meal (hand-built meal scoring) -----------------------------------

def test_score_meal_breakdown_sums_to_total_score():
    """The meal breakdown powers the "Why this meal scores" bars; its points must sum to
    the meal's total_score so the explanation can never drift from the number."""
    resp = client.get("/score_meal", params={"ids": "200692,Dave's Single", "goal": "high_protein"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["item_count"] == 2
    bd = body["breakdown"]
    assert [t["key"] for t in bd] == [
        "protein", "sugars", "fat", "carbs", "sodium", "calories"
    ]
    for t in bd:
        assert {"key", "label", "value", "unit", "points"} <= t.keys()
    # meal level compounds per-term display rounding, same tolerance as the meal-breakdown
    # scoring tests
    assert sum(t["points"] for t in bd) == pytest.approx(body["total_score"], abs=0.05)


def test_score_meal_total_equals_sum_of_item_scores():
    """A hand-built meal must score exactly as the optimizer would: total_score is the
    sum of the items' individual health_scores (same goal + max_calories)."""
    from api import ITEMS_BY_ID
    from recommend_items import health_score
    ids = ["200692", "Dave's Single"]
    resp = client.get("/score_meal", params={"ids": ",".join(ids), "goal": "high_protein"})
    assert resp.status_code == 200
    expected = round(
        sum(health_score(ITEMS_BY_ID[i], "high_protein", 600) for i in ids), 3
    )
    assert resp.json()["total_score"] == pytest.approx(expected, abs=0.001)


def test_score_meal_resolves_mixed_ids_including_wendys_string():
    """Wendy's ids are human names with spaces/apostrophes — must resolve as opaque
    strings alongside int ids, exactly like /items."""
    resp = client.get("/score_meal", params={"ids": "Dave's Single,600000"})
    assert resp.status_code == 200
    assert resp.json()["item_count"] == 2


def test_score_meal_skips_unknown_ids():
    """A meal referencing a since-deleted item still scores the rest (item_count reflects
    only matched items)."""
    resp = client.get("/score_meal", params={"ids": "Dave's Single,__nope__,600000"})
    assert resp.status_code == 200
    assert resp.json()["item_count"] == 2


def test_score_meal_empty_ids_is_400():
    resp = client.get("/score_meal", params={"ids": "  , "})
    assert resp.status_code == 400


def test_score_meal_bad_goal_is_422():
    resp = client.get("/score_meal", params={"ids": "600000", "goal": "keto"})
    assert resp.status_code == 422


# --- /search (menu-wide item search) -----------------------------------------

def test_search_matches_by_name_and_carries_score_breakdown():
    """A name search returns items whose title contains the query, each humanized with a
    score + 6-term breakdown, plus score_bounds for the 0-100 mapping."""
    resp = client.get("/search", params={"q": "baconator"})
    assert resp.status_code == 200
    body = resp.json()
    assert "score_bounds" in body
    results = body["results"]
    assert results, "expected at least one Baconator match"
    for item in results:
        assert "baconator" in item["title"].lower()
        assert item["score"] is not None
        assert [t["key"] for t in item["breakdown"]] == [
            "protein", "sugars", "fat", "carbs", "sodium", "calories"
        ]


def test_search_bypasses_calorie_cap():
    """Search must find items /recommend would hide behind its 600-cal cap — e.g. the
    960-cal Baconator."""
    titles = [i["title"] for i in client.get("/search", params={"q": "Baconator"}).json()["results"]]
    assert "Baconator" in titles


def test_search_bypasses_balanced_drink_drop():
    """/recommend drops drinks under the balanced goal; search must still surface them so a
    user can find a specific drink by name."""
    resp = client.get("/search", params={"q": "coca", "goal": "balanced"})
    assert resp.status_code == 200
    titles = [i["title"].lower() for i in resp.json()["results"]]
    assert any("coca-cola" in t for t in titles)


def test_search_scopes_to_restaurant():
    resp = client.get("/search", params={"q": "fries", "restaurant": "mcdonalds"})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert results
    assert all(i["restaurant"] == "mcdonalds" for i in results)


def test_search_results_ranked_by_score_desc():
    resp = client.get("/search", params={"q": "chicken"})
    assert resp.status_code == 200
    scores = [i["score"] for i in resp.json()["results"]]
    assert scores == sorted(scores, reverse=True)


def test_search_honors_vegetarian_filter():
    resp = client.get("/search", params={"q": "fries", "vegetarian": "true"})
    assert resp.status_code == 200
    assert all(i["vegetarian"] for i in resp.json()["results"])


def test_search_missing_q_is_422():
    assert client.get("/search").status_code == 422


def test_search_blank_q_is_400():
    resp = client.get("/search", params={"q": "   "})
    assert resp.status_code == 400


# --- vegetarian field invariant ----------------------------------------------

def test_every_item_has_boolean_vegetarian_field():
    """The vegetarian filter relies on every item carrying the tag; a dataset
    edit that drops it would silently hide items. Guard the whole corpus."""
    from api import ALL_ITEMS
    missing = [it.get("name") for it in ALL_ITEMS if not isinstance(it.get("vegetarian"), bool)]
    assert missing == [], f"items missing boolean 'vegetarian': {missing[:10]}"


def test_no_meat_keyword_in_any_vegetarian_item():
    """Safety tripwire: the feature's core contract is that no meat item is ever
    tagged vegetarian. Tagging is heuristic + manual overrides, so assert directly
    that no unambiguous meat/seafood term appears in any vegetarian item's name.
    Guards against a future dataset edit silently leaking meat into vegetarian views."""
    from api import ALL_ITEMS
    meat_terms = [
        "bacon", "beef", "chicken", "sausage", "pepperoni", "steak", "pork",
        "turkey", "brisket", "shrimp", "fish", "nugget", "baconator", "chorizo",
        "mcrib", "mcchicken", "filet", "carne", "anchov",
    ]
    leaks = [
        it["name"]
        for it in ALL_ITEMS
        if it.get("vegetarian") is True
        and any(term in it["name"].lower() for term in meat_terms)
    ]
    assert leaks == [], f"meat keyword found in vegetarian-tagged items: {leaks}"


def test_recommend_vegetarian_excludes_meat_and_keeps_veg():
    resp = client.get("/recommend", params={"vegetarian": "true", "format": "human", "top_n": 50})
    assert resp.status_code == 200
    titles = [r["title"].lower() for r in resp.json()["results"]]
    # no obvious meat items survive the filter
    assert not any("nugget" in t or "bacon" in t or "burger" in t for t in titles)
    # the humanized payload carries the flag, and everything returned is vegetarian
    assert all(r.get("vegetarian") is True for r in resp.json()["results"])


def test_recommend_vegetarian_off_by_default_includes_meat():
    resp = client.get("/recommend", params={"format": "human", "top_n": 50})
    titles = [r["title"].lower() for r in resp.json()["results"]]
    assert any("chicken" in t or "burger" in t or "nugget" in t for t in titles)


def test_optimize_meal_vegetarian_returns_all_veg_meal():
    resp = client.get("/optimize_meal", params={"vegetarian": "true", "restaurant": "all"})
    assert resp.status_code == 200
    body = resp.json()
    assert "meals" in body and body["meals"], "expected at least one vegetarian meal"
    for meal in body["meals"]:
        for item in meal["items"]:
            assert item.get("vegetarian") is True


# --- vegan field invariants --------------------------------------------------

def test_every_item_has_boolean_vegan_field():
    """The vegan filter relies on every item carrying the tag; a dataset edit
    that drops it would silently hide items. Guard the whole corpus."""
    from api import ALL_ITEMS
    missing = [it.get("name") for it in ALL_ITEMS if not isinstance(it.get("vegan"), bool)]
    assert missing == [], f"items missing boolean 'vegan': {missing[:10]}"


def test_vegan_is_subset_of_vegetarian():
    """A vegan item must also be vegetarian. This is the core safety invariant."""
    from api import ALL_ITEMS
    violations = [
        it.get("name") for it in ALL_ITEMS
        if it.get("vegan") and not it.get("vegetarian")
    ]
    assert violations == [], f"vegan-but-not-vegetarian items: {violations[:10]}"


def test_recommend_vegan_excludes_dairy_and_keeps_vegan():
    resp = client.get("/recommend", params={"vegan": "true", "goal": "low_fat", "format": "human", "top_n": 50})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert results, "expected vegan results but got none"
    titles = [r["title"].lower() for r in results]
    # no obvious dairy/egg items survive the filter
    assert not any("cheese" in t or "shake" in t or "egg" in t for t in titles)
    # everything returned is vegan (and therefore vegetarian)
    assert all(r.get("vegan") is True for r in results)
    assert all(r.get("vegetarian") is True for r in results)


def test_recommend_vegan_off_by_default_includes_non_vegan():
    resp = client.get("/recommend", params={"format": "human", "top_n": 50})
    results = resp.json()["results"]
    assert any(r.get("vegan") is False for r in results)


def test_optimize_meal_vegan_returns_all_vegan_meal():
    resp = client.get("/optimize_meal", params={"vegan": "true", "restaurant": "all"})
    assert resp.status_code == 200
    body = resp.json()
    assert "meals" in body and body["meals"], "expected at least one vegan meal"
    for meal in body["meals"]:
        for item in meal["items"]:
            assert item.get("vegan") is True


def test_no_dairy_keyword_in_any_vegan_item():
    """Regression tripwire: no vegan-tagged item name contains a dairy/egg term.
    Mirrors the meat tripwire for the vegetarian filter."""
    from api import ALL_ITEMS
    dairy_terms = [
        "cheese", "milk", "cream", "butter", "egg", "mayo", "ranch", "yogurt",
        "parfait", "shake", "float", "latte", "queso", "honey", "custard",
        "icedream", "sundae", "mcflurry", "cheddar", "parmesan",
    ]
    leaks = [
        it.get("name") for it in ALL_ITEMS
        if it.get("vegan") and any(term in (it.get("name") or "").lower() for term in dairy_terms)
    ]
    assert leaks == [], f"vegan items with a dairy/egg keyword: {leaks[:10]}"


# --- entree-less (sides-only) optimizer meals --------------------------------

def test_wendys_vegan_optimize_returns_sides_only_meal():
    resp = client.get("/optimize_meal?restaurant=wendys&vegan=true&goal=low_fat")
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("meals"), "expected a sides-only meal, got: %r" % body
    first = body["meals"][0]
    assert first["entree_less"] is True
    for item in first["items"]:
        assert item["vegan"] is True


def test_wendys_vegan_high_protein_still_no_meal():
    resp = client.get("/optimize_meal?restaurant=wendys&vegan=true&goal=high_protein")
    assert resp.status_code == 200
    assert "message" in resp.json()  # honest: sides cannot reach 35g protein


def test_normal_optimize_not_entree_less():
    resp = client.get("/optimize_meal?restaurant=mcdonalds&goal=balanced")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meals"][0]["entree_less"] is False


# ── Macro-range filters ──

def test_recommend_min_protein_filters_items():
    resp = client.get("/recommend", params={"min_protein": 30, "format": "human", "top_n": 50})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert results, "expected some high-protein items"
    assert all(r["protein"] >= 30 for r in results)


def test_recommend_max_sugar_filters_items():
    resp = client.get("/recommend", params={"max_sugar": 5, "goal": "low_sugar", "format": "human", "top_n": 50})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert results
    assert all(r["sugars"] <= 5 for r in results)


def test_recommend_max_sodium_filters_items():
    resp = client.get("/recommend", params={"max_sodium": 400, "format": "human", "top_n": 50})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert results
    assert all((r.get("sodium") or 0) <= 400 for r in results)


def test_recommend_negative_macro_is_422():
    resp = client.get("/recommend", params={"min_protein": -5})
    assert resp.status_code == 422


def test_optimize_min_protein_applies_to_meal_total():
    resp = client.get("/optimize_meal", params={"restaurant": "mcdonalds", "min_protein": 40})
    assert resp.status_code == 200
    for meal in resp.json()["meals"]:
        assert sum(i["protein"] for i in meal["items"]) >= 40


def test_optimize_max_fat_applies_to_meal_total():
    resp = client.get("/optimize_meal", params={"restaurant": "mcdonalds", "max_fat": 25})
    assert resp.status_code == 200
    for meal in resp.json()["meals"]:
        assert sum(i["fat"] for i in meal["items"]) <= 25


# ── Browse sort controls ──

def test_recommend_sort_calories_ascending():
    resp = client.get("/recommend", params={"sort": "calories", "format": "human", "top_n": 50})
    assert resp.status_code == 200
    cals = [r["calories"] for r in resp.json()["results"]]
    assert cals == sorted(cals)


def test_recommend_sort_protein_descending():
    resp = client.get("/recommend", params={"sort": "protein", "format": "human", "top_n": 50})
    assert resp.status_code == 200
    prot = [r["protein"] for r in resp.json()["results"]]
    assert prot == sorted(prot, reverse=True)


def test_recommend_sort_sugars_ascending():
    resp = client.get("/recommend", params={"sort": "sugars", "format": "human", "top_n": 50})
    assert resp.status_code == 200
    sug = [r["sugars"] for r in resp.json()["results"]]
    assert sug == sorted(sug)


def test_recommend_default_sort_is_score_descending():
    resp = client.get("/recommend", params={"top_n": 50})  # raw format keeps health_score
    assert resp.status_code == 200
    scores = [r["health_score"] for r in resp.json()["results"]]
    assert scores == sorted(scores, reverse=True)


def test_recommend_bad_sort_is_422():
    resp = client.get("/recommend", params={"sort": "bogus"})
    assert resp.status_code == 422
