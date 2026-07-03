from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
import json
import logging
import os
import sys
import time
from pathlib import Path

import statistics

import recommend_items
from recommend_items import get_recommendations, humanize_items, build_optimal_meal, score_bounds

app = FastAPI(title = "Fast Food Health Recommender")

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:5174,http://localhost:5175",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["Content-Type"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("crave.api")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log method, path, status, and latency so Render logs are usable for debugging."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s -> %s (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


BASE_DIR = Path(__file__).resolve().parent

def _load_json(path: Path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"ERROR loading {path}: {e}", file=sys.stderr)
        sys.exit(1)

mcdonalds_items = _load_json(BASE_DIR / "mcdonalds_items.json")

chickfila_raw = _load_json(BASE_DIR / "chickfila_items.json")
chickfila_items = list(chickfila_raw.values()) if isinstance(chickfila_raw, dict) else chickfila_raw

wendys_items = _load_json(BASE_DIR / "wendys_items.json")

tacobell_items = _load_json(BASE_DIR / "tacobell_items.json")

burgerking_items = _load_json(BASE_DIR / "burgerking_items.json")

ALL_ITEMS = mcdonalds_items + chickfila_items + wendys_items + tacobell_items + burgerking_items

# Impute missing sodium so restaurants lacking the data (e.g. Wendy's) don't get an
# unfair scoring advantage. Use the median of *food* items that report sodium — every
# missing-sodium item is a food, and including near-zero-sodium drinks would skew the
# reference far too low. Tracks the data instead of hardcoding a magic number.
_reported_sodium = [
    it["sodium"] for it in ALL_ITEMS
    if it.get("sodium") is not None and it.get("item_type") not in ("drink", "sauce")
]
if _reported_sodium:
    recommend_items.IMPUTED_SODIUM_MG = float(statistics.median(_reported_sodium))

# Index for O(1) lookup by item_id. Keyed on str() because id types differ across
# datasets (McDonald's/Taco Bell ints, Chick-fil-A slugs, Wendy's names) — they must be
# treated as opaque strings. Powers /items, used to rehydrate shared-meal URLs.
ITEMS_BY_ID = {
    str(it["item_id"]): it for it in ALL_ITEMS if it.get("item_id") is not None
}

@app.get("/")
def root():
    return {
        "message": "Crave API is live.",
        "docs": "/docs",
        "endpoints": ["/recommend", "/optimize_meal", "/categories", "/health"],
    }

@app.get("/health")
def health():
    """Liveness/readiness probe: confirms data loaded. Use for uptime checks."""
    return {
        "status": "ok",
        "items": len(ALL_ITEMS),
        "restaurants": {
            "mcdonalds": len(mcdonalds_items),
            "chickfila": len(chickfila_items),
            "wendys": len(wendys_items),
            "tacobell": len(tacobell_items),
            "burgerking": len(burgerking_items),
        },
    }

@app.get("/categories")
def categories(
    restaurant: str = Query("all", pattern="^(mcdonalds|chickfila|wendys|tacobell|burgerking|all)$")
):
    if restaurant == "mcdonalds":
        items = mcdonalds_items
    elif restaurant == "chickfila":
        items = chickfila_items
    elif restaurant == "wendys":
        items = wendys_items
    elif restaurant == "tacobell":
        items = tacobell_items
    elif restaurant == "burgerking":
        items = burgerking_items
    else:
        items = ALL_ITEMS

    cats = sorted(set(item["category"] for item in items if item.get("category")))
    return {"restaurant": restaurant, "categories": cats}

@app.get("/recommend")
def recommend(
    restaurant: str = Query("all", pattern = "^(mcdonalds|chickfila|wendys|tacobell|burgerking|all)$"),
    max_calories: int = Query(600, ge=1),
    top_n: int = Query(10, ge = 1, le = 50),
    goal: str = Query("balanced", pattern = "^(balanced|high_protein|low_sugar|low_fat)$"),
    category: str | None = Query(None),
    format: str = Query("raw", pattern = "^(raw|human)$"),
    vegetarian: bool = Query(False),
    vegan: bool = Query(False),
    min_protein: int | None = Query(None, ge=0),
    max_sugar: int | None = Query(None, ge=0),
    max_fat: int | None = Query(None, ge=0),
    max_sodium: int | None = Query(None, ge=0),
    sort: str = Query("score", pattern = "^(score|calories|protein|sugars|fat|sodium)$"),
):
    if restaurant == "mcdonalds":
        items = mcdonalds_items
    elif restaurant == "chickfila":
        items = chickfila_items
    elif restaurant == "wendys":
        items = wendys_items
    elif restaurant == "tacobell":
        items = tacobell_items
    elif restaurant == "burgerking":
        items = burgerking_items
    else:
        items = ALL_ITEMS

    if vegetarian:
        items = [it for it in items if it.get("vegetarian")]

    if vegan:
        items = [it for it in items if it.get("vegan")]

    if category:
        valid = {(it.get("category") or "").lower() for it in items}
        if category.lower() not in valid:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown category '{category}' for restaurant '{restaurant}'.",
            )

    results = get_recommendations(
        items,
        max_calories = max_calories,
        top_n = top_n,
        goal = goal,
        category = category,
        min_protein = min_protein,
        max_sugar = max_sugar,
        max_fat = max_fat,
        max_sodium = max_sodium,
        sort = sort,
    )

    if format == "human":
        return {
            "summary": f"Top {len(results)} {goal.replace('_',' ')} items"
                       + (f" in {category}" if category else ""),
            "results": humanize_items(results),
            "score_bounds": score_bounds(goal),
        }

    return {
        "summary": f"Top {len(results)} {goal.replace('_',' ')} items from {restaurant}"
                   + (f" in {category}" if category else ""),
        "results": results,
        "score_bounds": score_bounds(goal),
    }


@app.get("/items")
def items(ids: str = Query(..., description="Comma-separated item_ids to fetch")):
    """Fetch specific items by id, preserving request order. Powers shared-meal URLs:
    the frontend rehydrates a meal from the ids in the URL. Unknown ids are silently
    skipped so a link to a since-deleted item still loads the rest of the meal."""
    requested = [part.strip() for part in ids.split(",") if part.strip()]
    if not requested:
        raise HTTPException(status_code=400, detail="Query param 'ids' must not be empty.")

    matched = [ITEMS_BY_ID[i] for i in requested if i in ITEMS_BY_ID]
    return {"results": humanize_items(matched)}


@app.get("/optimize_meal")
def optimize_meal(
    restaurant: str = Query("all", pattern="^(mcdonalds|chickfila|wendys|tacobell|burgerking|all)$"),
    max_calories: int = Query(800, ge=1),
    goal: str = Query("balanced", pattern="^(balanced|high_protein|low_sugar|low_fat)$"),
    category: str | None = Query(None),
    allow_side: bool = Query(True),
    allow_drink: bool = Query(True),
    format: str = Query("human", pattern="^(raw|human)$"),
    vegetarian: bool = Query(False),
    vegan: bool = Query(False),
    min_protein: int | None = Query(None, ge=0),
    max_sugar: int | None = Query(None, ge=0),
    max_fat: int | None = Query(None, ge=0),
    max_sodium: int | None = Query(None, ge=0),
):
    per_restaurant = {
        "mcdonalds": mcdonalds_items,
        "chickfila": chickfila_items,
        "wendys": wendys_items,
        "tacobell": tacobell_items,
        "burgerking": burgerking_items,
    }

    if category and restaurant != "all":
        valid = {(it.get("category") or "").lower() for it in per_restaurant[restaurant]}
        if category.lower() not in valid:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown category '{category}' for restaurant '{restaurant}'.",
            )

    def _optimize(items):
        if vegetarian:
            items = [it for it in items if it.get("vegetarian")]
        if vegan:
            items = [it for it in items if it.get("vegan")]
        return build_optimal_meal(
            items,
            max_calories=max_calories,
            goal=goal,
            allow_side=allow_side,
            allow_drink=allow_drink,
            category_filter=category,
            min_protein=min_protein,
            max_sugar=max_sugar,
            max_fat=max_fat,
            max_sodium=max_sodium,
        )

    if restaurant == "all":
        all_meals = []
        for r_items in per_restaurant.values():
            result = _optimize(r_items)
            if result:
                all_meals.extend(result["meals"])
        all_meals.sort(key=lambda m: m["total_score"], reverse=True)
        meal = {"meals": all_meals[:3]} if all_meals else None
    else:
        meal = _optimize(per_restaurant[restaurant])

    if not meal:
        return {"message": "No valid meal found under constraints."}

    if format == "human":
        return {
            "meals": [
                {
                    "items": humanize_items(m["items"]),
                    "total_score": m["total_score"],
                    "total_calories": m["total_calories"],
                    "entree_less": m.get("entree_less", False),
                }
                for m in meal["meals"]
            ],
            "score_bounds": score_bounds(goal),
        }

    return {**meal, "score_bounds": score_bounds(goal)}
