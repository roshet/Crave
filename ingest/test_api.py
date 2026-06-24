"""Endpoint + integration tests for the Crave API.

Complements test_scoring.py (pure scoring math) by exercising the HTTP layer through
FastAPI's TestClient against the real app — same data-loading path as production. Covers
happy paths, input validation (400/422), the optimizer's meal assembly + hard
constraints, and the /health probe.
"""

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


# --- vegetarian field invariant ----------------------------------------------

def test_every_item_has_boolean_vegetarian_field():
    """The vegetarian filter relies on every item carrying the tag; a dataset
    edit that drops it would silently hide items. Guard the whole corpus."""
    from api import ALL_ITEMS
    missing = [it.get("name") for it in ALL_ITEMS if not isinstance(it.get("vegetarian"), bool)]
    assert missing == [], f"items missing boolean 'vegetarian': {missing[:10]}"


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
