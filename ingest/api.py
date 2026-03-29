from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import json
import os
from pathlib import Path

from recommend_items import get_recommendations, humanize_items, build_optimal_meal
import recommend_items
print("USING recommend_items FROM:", recommend_items.__file__)

app = FastAPI(title = "Fast Food Health Recommender")

allowed_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


BASE_DIR = Path(__file__).resolve().parent

with open(BASE_DIR / "mcdonalds_items.json", "r", encoding="utf-8") as f:
    mcdonalds_items = json.load(f)

with open(BASE_DIR / "chickfila_items.json", "r", encoding="utf-8") as f:
    chickfila_raw = json.load(f)
    
with open(BASE_DIR / "wendys_items.json", "r", encoding="utf-8") as f:
    wendys_items = json.load(f)

# Chick-fil-A comes in as a dict → normalize to list
if isinstance(chickfila_raw, dict):
    chickfila_items = list(chickfila_raw.values())
else:
    chickfila_items = chickfila_raw

ALL_ITEMS = mcdonalds_items + chickfila_items + wendys_items
    
@app.get("/recommend")
def recommend(
    restaurant: str = Query("mcdonalds", pattern = "^(mcdonalds|chickfila|wendys|all)$"),
    max_calories: int = Query(600, ge=0),
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
    restaurant: str = Query("mcdonalds", pattern="^(mcdonalds|chickfila|wendys|all)$"),
    max_calories: int = Query(800, ge=0),
    goal: str = Query("balanced", pattern="^(balanced|high_protein|low_sugar|low_fat)$"),
    category: str | None = Query(None),
    allow_side: bool = Query(True),
    allow_drink: bool = Query(True),
    format: str = Query("human", pattern="^(raw|human)$"),
):
    print("CATEGORY RECEIVED:", category)
    
    if restaurant == "mcdonalds":
        items = mcdonalds_items
    elif restaurant == "chickfila":
        items = chickfila_items
    elif restaurant == "wendys":
        items = wendys_items
    else:
        items = ALL_ITEMS

    meal = build_optimal_meal(
        items,
        max_calories=max_calories,
        goal=goal,
        allow_side=allow_side,
        allow_drink=allow_drink,
        category_filter=category,
    )

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
