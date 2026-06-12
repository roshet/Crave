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
    """Sodium was derived from the official UK Salt (g) column (salt_g * 400), so no
    Wendy's food item should fall back to the scoring engine's imputed median."""
    from api import wendys_items

    missing = [i["name"] for i in wendys_items
               if i.get("item_type") == "food" and i.get("sodium") is None]
    assert not missing, f"Wendy's food items lack sodium: {missing}"


# --- /categories -------------------------------------------------------------

def test_categories_returns_list():
    resp = client.get("/categories", params={"restaurant": "wendys"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["restaurant"] == "wendys"
    assert isinstance(body["categories"], list) and body["categories"]
