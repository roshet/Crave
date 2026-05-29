from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import sys
from pathlib import Path

from recommend_items import get_recommendations, humanize_items, build_optimal_meal

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

ALL_ITEMS = mcdonalds_items + chickfila_items + wendys_items

@app.get("/")
def root():
    return {
        "message": "Crave API is live.",
        "docs": "/docs",
        "endpoints": ["/recommend", "/optimize_meal", "/categories"],
    }

@app.get("/categories")
def categories(
    restaurant: str = Query("all", pattern="^(mcdonalds|chickfila|wendys|all)$")
):
    if restaurant == "mcdonalds":
        items = mcdonalds_items
    elif restaurant == "chickfila":
        items = chickfila_items
    elif restaurant == "wendys":
        items = wendys_items
    else:
        items = ALL_ITEMS

    cats = sorted(set(item["category"] for item in items if item.get("category")))
    return {"restaurant": restaurant, "categories": cats}

@app.get("/recommend")
def recommend(
    restaurant: str = Query("all", pattern = "^(mcdonalds|chickfila|wendys|all)$"),
    max_calories: int = Query(600, ge=1),
    top_n: int = Query(10, ge = 1, le = 50),
    goal: str = Query("balanced", pattern = "^(balanced|high_protein|low_sugar|low_fat)$"),
    category: str | None = Query(None),
    format: str = Query("raw", pattern = "^(raw|human)$")
):
    if restaurant == "mcdonalds":
        items = mcdonalds_items
    elif restaurant == "chickfila":
        items = chickfila_items
    elif restaurant == "wendys":
        items = wendys_items
    else:
        items = ALL_ITEMS

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
        category = category
    )

    if format == "human":
        return {
            "summary": f"Top {len(results)} {goal.replace('_',' ')} items"
                       + (f" in {category}" if category else ""),
            "results": humanize_items(results),
        }

    return {
        "summary": f"Top {len(results)} {goal.replace('_',' ')} items from {restaurant}"
                   + (f" in {category}" if category else ""),
        "results": results,
    }


@app.get("/optimize_meal")
def optimize_meal(
    restaurant: str = Query("all", pattern="^(mcdonalds|chickfila|wendys|all)$"),
    max_calories: int = Query(800, ge=1),
    goal: str = Query("balanced", pattern="^(balanced|high_protein|low_sugar|low_fat)$"),
    category: str | None = Query(None),
    allow_side: bool = Query(True),
    allow_drink: bool = Query(True),
    format: str = Query("human", pattern="^(raw|human)$"),
):
    per_restaurant = {
        "mcdonalds": mcdonalds_items,
        "chickfila": chickfila_items,
        "wendys": wendys_items,
    }

    if category and restaurant != "all":
        valid = {(it.get("category") or "").lower() for it in per_restaurant[restaurant]}
        if category.lower() not in valid:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown category '{category}' for restaurant '{restaurant}'.",
            )

    def _optimize(items):
        return build_optimal_meal(
            items,
            max_calories=max_calories,
            goal=goal,
            allow_side=allow_side,
            allow_drink=allow_drink,
            category_filter=category,
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
                }
                for m in meal["meals"]
            ]
        }

    return meal
