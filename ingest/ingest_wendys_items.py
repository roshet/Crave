import csv
import json

RESTAURANT = "wendys"

items = []

def detect_category(name):
    name = name.lower()
    
    if "salad" in name:
        return "salads"
    
    if "wrap" in name:
        return "wraps"

    if "nugget" in name or "chicken" in name:
        return "chicken"

    if "fries" in name or "potato" in name or "chili" in name:
        return "sides"
    
    if "burger" in name or "baconator" in name or "dave" in name:
        return "burgers"
    
    return "other"

with open("wendys_items.csv", newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)

    for row in reader:
        items.append({
            "item_id": row["name"],
            "name": row["name"],
            "restaurant": RESTAURANT,
            "category": detect_category(row["name"]),
            "item_type": "food",
            "calories": float(row["calories"]),
            "protein": float(row["protein"]),
            "fat": float(row["fat"]),
            "carbohydrate": float(row["carbohydrate"]),
            "sugars": float(row["sugars"]),
            "sodium": None
        })

with open("wendys_items.json", "w", encoding="utf-8") as f:
    json.dump(items, f, indent=2)

print("Saved", len(items), "Wendy's items")