import math

# Max extra contribution a single nutrient term can add beyond its cap. Keeps the
# "no single nutrient dominates" property while letting the score keep discriminating
# past the cap (a hard clamp made e.g. 40g and 80g of fat score identically).
TAIL_WEIGHT = 0.5

# Sodium is missing for some restaurants (e.g. Wendy's). Treating it as 0 gave those
# items an unfair free pass. We impute a representative value instead. api.py overwrites
# this at startup with the median sodium of items that report it, so it tracks the data.
IMPUTED_SODIUM_MG = 600.0

GOAL_PROFILES  = {
    "balanced": {
        "protein": 1.2,
        "sugars": 1.0,
        "fat": 1.0,
        "carbs": 0.6,
        "sodium": 1.2,
        "calories": 1.0,
    },
    "high_protein": {
        "protein": 2.0,
        "sugars": 0.8,
        "fat": 1.0,
        "carbs": 0.4,
        "sodium": 1.0,
        "calories": 0.8,
    },
    "low_sugar": {
        "protein": 1.0,
        "sugars": 2.0,
        "fat": 0.8,
        "carbs": 0.6,
        "sodium": 1.0,
        "calories": 1.0,
    },
    "low_fat": {
        "protein": 1.0,
        "sugars": 0.8,
        "fat": 2.0,
        "carbs": 0.6,
        "sodium": 1.0,
        "calories": 1.0,
    },
}

GOAL_CONSTRAINTS = {
    "high_protein": {"min_protein": 35},
    "low_sugar": {"max_sugar": 20},
    "low_fat": {"max_fat": 30},
}

def saturate(value, cap):
    """Like clamp() within [0, cap], but keeps rising past the cap with diminishing
    returns instead of flattening at 1.0. Bounded by (1 + TAIL_WEIGHT)."""
    if cap == 0:
        return 0.0
    base = min(value / cap, 1.0)                              # unchanged in-range
    overflow = max(value - cap, 0.0)
    extra = TAIL_WEIGHT * (1.0 - math.exp(-overflow / cap))   # 0 at cap -> TAIL_WEIGHT
    return base + extra

def score_bounds(goal="balanced"):
    """Analytic per-item min/max of health_score for a goal, derived from the weights
    and TAIL_WEIGHT. The frontend uses these to map raw scores onto a 0-100 scale, so
    they stay in sync with the weights automatically (no hand-tuned constants)."""
    w = GOAL_PROFILES.get(goal, GOAL_PROFILES["balanced"])
    term = 1.0 + TAIL_WEIGHT
    return {
        "max": term * w["protein"],
        "min": -term * (w["sugars"] + w["fat"] + w["carbs"] + w["sodium"] + w["calories"]),
    }

def _score_terms(item, goal = "balanced", max_calories = 600):
    """Per-nutrient weighted terms behind health_score, in display order. The sum of
    every term's "points" equals health_score, so the score and its explanation share a
    single source of truth. Protein raises the score (points >= 0); the five penalty
    terms lower it (points <= 0). "value" is the real gram/mg amount shown to the user."""
    w = GOAL_PROFILES.get(goal, GOAL_PROFILES["balanced"])

    protein = item.get("protein") or 0
    sugars = item.get("sugars") or 0
    fat = item.get("fat") or 0
    carbs = item.get("carbohydrate") or item.get("carbs") or 0
    # sodium may be None for some restaurants (e.g. Wendy's) — impute so missing data
    # doesn't earn a free pass relative to items that honestly report sodium
    sodium_raw = item.get("sodium")
    sodium = sodium_raw if sodium_raw is not None else IMPUTED_SODIUM_MG
    calories = item.get("calories") or 0

    return [
        {"key": "protein",  "label": "Protein",  "value": protein,  "unit": "g",
         "points": saturate(protein, 30) * w["protein"]},
        {"key": "sugars",   "label": "Sugar",    "value": sugars,   "unit": "g",
         "points": -saturate(sugars, 25) * w["sugars"]},
        {"key": "fat",      "label": "Fat",      "value": fat,      "unit": "g",
         "points": -saturate(fat, 40) * w["fat"]},
        {"key": "carbs",    "label": "Carbs",    "value": carbs,    "unit": "g",
         "points": -saturate(carbs, 60) * w["carbs"]},
        {"key": "sodium",   "label": "Sodium",   "value": sodium,   "unit": "mg",
         "points": -saturate(sodium, 2000) * w["sodium"]},
        {"key": "calories", "label": "Calories", "value": calories, "unit": "",
         "points": -saturate(calories, max_calories) * w["calories"]},
    ]


def health_score(item, goal = "balanced", max_calories = 600):
    return round(sum(t["points"] for t in _score_terms(item, goal, max_calories)), 3)


def score_breakdown(item, goal = "balanced", max_calories = 600):
    """health_score's per-nutrient terms with value/points rounded for display. Powers
    the "Why this score" contribution bars. Sum of points == health_score."""
    return [
        {**t, "value": round(t["value"], 1), "points": round(t["points"], 3)}
        for t in _score_terms(item, goal, max_calories)
    ]


def meal_breakdown(meal_items, goal = "balanced", max_calories = 600):
    """Element-wise sum of the per-nutrient terms across a meal's items. A meal's
    total_score is the sum of its items' scores, so this sums to it per nutrient."""
    totals = None
    for item in meal_items:
        for i, t in enumerate(_score_terms(item, goal, max_calories)):
            if totals is None:
                totals = []
            if i == len(totals):
                totals.append({k: t[k] for k in ("key", "label", "unit", "value", "points")})
            else:
                totals[i]["value"] += t["value"]
                totals[i]["points"] += t["points"]
    if not totals:
        return []
    return [
        {**t, "value": round(t["value"], 1), "points": round(t["points"], 3)}
        for t in totals
    ]

def explain_item(item, goal):
    protein = item.get("protein") or 0
    sugars = item.get("sugars") or 0
    fat = item.get("fat") or 0
    carbs = item.get("carbohydrate") or item.get("carbs") or 0
    sodium_raw = item.get("sodium")
    sodium = sodium_raw if sodium_raw is not None else IMPUTED_SODIUM_MG
    calories = item.get("calories") or 0

    reasons = []

    if protein >= 20:
        reasons.append("high protein")
    elif protein >= 10:
        reasons.append("moderate protein")

    if sugars <= 5:
        reasons.append("low sugar")
    elif sugars >= 15:
        reasons.append("high sugar")

    if fat <= 10:
        reasons.append("low fat")
    elif fat >= 25:
        reasons.append("high fat")

    if carbs <= 30:
        reasons.append("lower carbs")
    elif carbs >= 60:
        reasons.append("high carbs")

    if sodium_raw is None:
        reasons.append("sodium data unavailable")
    elif sodium <= 500:
        reasons.append("low sodium")
    elif sodium >= 1000:
        reasons.append("high sodium")

    if calories <= 500:
        reasons.append("lower calorie option")

    if goal == "high_protein":
        reasons.insert(0, "optimized for high protein")
    elif goal == "low_sugar":
        reasons.insert(0, "optimized for low sugar")
    elif goal == "low_fat":
        reasons.insert(0, "optimized for low fat")
    else:
        reasons.insert(0, "balanced nutrition profile")

    return ", ".join(reasons)

def humanize_items(items):
    human = []

    for item in items:
        carbs = item.get("carbohydrate") or item.get("carbs") or 0
        sodium = item.get("sodium")
        sodium_display = f"{sodium}mg sodium" if sodium is not None else "sodium N/A"

        human.append({
            "item_id": item.get("item_id"),
            "title": item["name"],
            "restaurant": item["restaurant"],
            "category": item["category"],
            "summary": item.get("reason", ""),
            "nutrition": (
                f'{item["calories"]} kcal · '
                f'{item["protein"]}g protein · '
                f'{item["sugars"]}g sugar · '
                f'{item["fat"]}g fat · '
                f'{carbs}g carbs · '
                f'{sodium_display}'
            ),

            "calories": float(item.get("calories") or 0),
            "protein": float(item.get("protein") or 0),
            "sugars": float(item.get("sugars") or 0),
            "fat": float(item.get("fat") or 0),
            "carbs": float(item.get("carbohydrate") or item.get("carbs") or 0),
            "sodium": float(item.get("sodium") or 0),

            "score": item.get("health_score"),
            "breakdown": item.get("breakdown"),
            "vegetarian": bool(item.get("vegetarian", False)),
            "vegan": bool(item.get("vegan", False)),
        })

    return human

def get_recommendations(
    items,
    max_calories = 600,
    top_n = 10,
    goal = "balanced",
    category = None,
    min_protein = None,
    max_sugar = None,
    max_fat = None,
    max_sodium = None,
    sort = "score"):

    scored_items = []
    category_lower = category.lower() if category else None

    for item in items:
        if item.get("item_type") == "sauce":
            continue

        if goal == "balanced" and item.get("item_type") == "drink":
            continue

        if category_lower and item["category"].lower() != category_lower:
            continue

        calories = item.get("calories")
        protein = item.get("protein") or 0

        if calories is None or calories > max_calories:
            continue

        if goal == "balanced" and protein < 8:
            continue

        # Optional user macro filters (each None = unset). Item-level here; the meal
        # optimizer applies the same bounds to meal totals.
        if min_protein is not None and protein < min_protein:
            continue
        if max_sugar is not None and (item.get("sugars") or 0) > max_sugar:
            continue
        if max_fat is not None and (item.get("fat") or 0) > max_fat:
            continue
        if max_sodium is not None and (item.get("sodium") or 0) > max_sodium:
            continue

        score = health_score(item, goal, max_calories)
        item_copy = item.copy()
        item_copy["health_score"] = score
        item_copy["reason"] = explain_item(item, goal)
        item_copy["breakdown"] = score_breakdown(item, goal, max_calories)
        scored_items.append(item_copy)

    # Sort before the top_n slice so a nutrient sort surfaces the true best items for that
    # field (not just a reordering of the top-by-score set). Direction is per-field: score
    # and protein high→low; calories/sugars/fat/sodium low→high.
    if sort == "score":
        scored_items.sort(key = lambda x: x["health_score"], reverse = True)
    else:
        reverse = sort == "protein"
        scored_items.sort(key = lambda x: x.get(sort) or 0, reverse = reverse)

    return scored_items[:top_n]

def build_optimal_meal(
    items,
    max_calories=800,
    goal="balanced",
    allow_side=True,
    allow_drink=True,
    category_filter=None,
    min_protein=None,
    max_sugar=None,
    max_fat=None,
    max_sodium=None,
):
    """
    Build a meal: 1 entree + optional side + optional drink
    Objective: maximize total health_score under calorie constraint
    """

    if category_filter:
        category_filter = category_filter.lower()

    entree_categories = {
        "burgers", "entrees", "salads", "nuggets_strips", "breakfast",
        "chicken", "chicken_fish", "wraps", "snack_wraps",
        "kid_s_meals",
        "tacos", "burritos", "quesadillas", "nachos", "specialties",
    }
    side_categories = {"fries_sides", "sides", "desserts", "sweets"}

    entrees = []
    sides = []
    drinks = []

    for item in items:
        if item.get("item_type") == "sauce":
            continue

        cat = (item.get("category") or "").lower()
        item_type = (item.get("item_type") or "").lower()

        if item_type == "drink" or cat in {"beverages", "drinks", "mccafe_coffees"}:
            drinks.append(item)
            continue

        if cat in side_categories:
            sides.append(item)
            continue

        if cat in entree_categories:
            if category_filter and cat != category_filter:
                continue
            entrees.append(item)
            continue

    if entrees:
        anchors = entrees
        entree_less = False
    elif sides:
        anchors = sides
        entree_less = True
    else:
        return None

    # Pre-compute health scores to avoid repeated calls inside the triple loop
    score_cache = {
        id(i): health_score(i, goal, max_calories)
        for i in entrees + sides + drinks
    }

    sides_list = [None] if entree_less else (sides if (allow_side and sides) else [None])
    drinks_list = drinks if (allow_drink and drinks) else [None]

    top_meals = []

    for entree in anchors:
        for side in sides_list:
            for drink in drinks_list:
                meal_items = [entree]
                if side:
                    meal_items.append(side)
                if drink:
                    meal_items.append(drink)

                total_calories = sum((i.get("calories") or 0) for i in meal_items)
                if total_calories > max_calories:
                    continue

                total_protein = sum((i.get("protein") or 0) for i in meal_items)
                total_sugar = sum((i.get("sugars") or 0) for i in meal_items)
                total_fat = sum((i.get("fat") or 0) for i in meal_items)
                total_sodium = sum((i.get("sodium") or 0) for i in meal_items)

                constraints = GOAL_CONSTRAINTS.get(goal, {})

                if "min_protein" in constraints and total_protein < constraints["min_protein"]:
                    continue

                if "max_sugar" in constraints and total_sugar > constraints["max_sugar"]:
                    continue

                if "max_fat" in constraints and total_fat > constraints["max_fat"]:
                    continue

                # Optional user macro filters on the meal total (each None = unset),
                # stacked on top of the goal's built-in constraints above.
                if min_protein is not None and total_protein < min_protein:
                    continue
                if max_sugar is not None and total_sugar > max_sugar:
                    continue
                if max_fat is not None and total_fat > max_fat:
                    continue
                if max_sodium is not None and total_sodium > max_sodium:
                    continue

                total_score = sum(score_cache[id(i)] for i in meal_items)
                top_meals.append((total_score, meal_items))

    if not top_meals:
        return None

    top_meals.sort(key=lambda x: x[0], reverse=True)
    top_meals = top_meals[:3]

    ranked_results = []

    for score, meal_items in top_meals:
        enriched = []
        for it in meal_items:
            it_copy = it.copy()
            it_copy["health_score"] = score_cache[id(it)]
            it_copy["reason"] = explain_item(it, goal)
            enriched.append(it_copy)

        ranked_results.append({
            "items": enriched,
            "total_score": round(score, 3),
            "total_calories": sum((i.get("calories") or 0) for i in enriched),
            "entree_less": entree_less,
            "breakdown": meal_breakdown(meal_items, goal, max_calories),
        })

    return {
        "meals": ranked_results
    }
