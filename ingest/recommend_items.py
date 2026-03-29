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

def clamp(value, max_value):
    return min(value / max_value, 1.0)

def health_score(item, goal = "balanced", max_calories = 600):
    w = GOAL_PROFILES.get(goal, GOAL_PROFILES["balanced"])
    
    protein = item.get("protein") or 0
    sugars = item.get("sugars") or 0
    fat = item.get("fat") or 0
    carbs = item.get("carbohydrate") or item.get("carbs") or 0
    sodium = item.get("sodium") or 0
    calories = item.get("calories") or 0
    
    protein_score = clamp(protein, 30) * w["protein"]
    
    sugar_penalty = clamp(sugars, 25) * w["sugars"]
    fat_penalty = clamp(fat, 40) * w["fat"]
    carb_penalty = clamp(carbs, 60) * w["carbs"]
    sodium_penalty = clamp(sodium, 2000) * w["sodium"]
    calorie_penalty = clamp(calories, max_calories) * w["calories"]
    
    score = (
        protein_score
        - sugar_penalty
        - fat_penalty
        - carb_penalty
        - sodium_penalty
        - calorie_penalty
    )
    
    return round(score, 3)

def explain_item(item, goal):
    protein = item.get("protein") or 0
    sugars = item.get("sugars") or 0
    fat = item.get("fat") or 0
    carbs = item.get("carbohydrate") or item.get("carbs") or 0
    sodium = item.get("sodium") or 0
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
        
    if sodium <= 500:
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
        
        human.append({
            "title": item["name"],
            "restaurant": item["restaurant"],
            "category": item["category"],
            "summary": item["reason"],
            "nutrition": (
                f'{item["calories"]} kcal · '
                f'{item["protein"]}g protein · '
                f'{item["sugars"]}g sugar · '
                f'{item["fat"]}g fat · '
                f'{carbs}g carbs · '
                f'{item["sodium"]}mg sodium'
            ),
            
            "calories": item.get("calories", 0),
            "protein": item.get("protein", 0),
            "sugars": item.get("sugars", 0),
            "fat": item.get("fat", 0),
            "carbs": item.get("carbohydrate", 0) or item.get("carbs") or 0,
            "sodium": item.get("sodium", 0),
            
            "score": item["health_score"],
        })
            
    return human

def get_recommendations(
    items, 
    max_calories = 600, 
    top_n = 10, 
    goal = "balanced",
    category = None):
    
    scored_items = []
    
    for item in items:
        if item.get("item_type") == "sauce":
            continue
        
        if goal == "balanced" and item.get("item_type") == "drink":
            continue
        
        if category and item["category"] != category:
            continue
        
        calories = item.get("calories")
        protein = item.get("protein") or 0
    
        if calories is None or calories > max_calories:
            continue
        
        if goal == "balanced" and protein < 8:
            continue
    
        score = health_score(item, goal, max_calories)
        item_copy = item.copy()
        item_copy["health_score"] = score
        item_copy["reason"] = explain_item(item, goal)
        scored_items.append(item_copy)

    scored_items.sort(key = lambda x: x["health_score"], reverse = True)
    return scored_items[:top_n]

def build_optimal_meal(
    items,
    max_calories=800,
    goal="balanced",
    allow_side=True,
    allow_drink=True,
    category_filter=None,
):
    """
    Build a meal: 1 entree + optional side + optional drink
    Objective: maximize total health_score under calorie constraint
    """
    
    if category_filter:
        category_filter = category_filter.lower()

    # Category mappings for each restaurant
    entree_categories = {"burgers", "entrees", "salads", "nuggets_strips", "breakfast"}
    side_categories = {"fries_sides", "sides", "desserts"}

    entrees = []
    sides = []
    drinks = []

    for item in items:
        if item.get("item_type") == "sauce":
            continue

        cat = (item.get("category") or "").lower()
        item_type = (item.get("item_type") or "").lower()
        
        if item_type == "drink" or cat in {"beverages", "drinks"}:
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

    if not entrees:
        return None

    # Optional slots
    sides_list = [None] + sides if allow_side else [None]
    drinks_list = [None] + drinks if allow_drink else [None]

    top_meals = []

    for entree in entrees:
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
                
                constraints = GOAL_CONSTRAINTS.get(goal, {})
                
                if "min_protein" in constraints and total_protein < constraints["min_protein"]:
                    continue
                
                if "max_sugar" in constraints and total_sugar > constraints["max_sugar"]:
                    continue
                
                if "max_fat" in constraints and total_fat > constraints["max_fat"]:
                    continue

                total_score = sum(health_score(i, goal, max_calories) for i in meal_items)

                top_meals.append((total_score, meal_items))

    if not top_meals:
        return None
    
    # Sort meals by score descending
    top_meals.sort(key=lambda x: x[0], reverse=True)
    
    # Keep top 3
    top_meals = top_meals[:3]

    # Attach score + reason to each item for the UI
    ranked_results = []
    
    for score, meal_items in top_meals:
        enriched = []
        for it in meal_items:
            it_copy = it.copy()
            it_copy["health_score"] = health_score(it, goal, max_calories)
            it_copy["reason"] = explain_item(it, goal)
            enriched.append(it_copy)
        
        ranked_results.append({
            "items": enriched,
            "total_score": round(score, 3),
            "total_calories": sum((i.get("calories") or 0) for i in enriched),
        })
    
    return {
        "meals": ranked_results
    }