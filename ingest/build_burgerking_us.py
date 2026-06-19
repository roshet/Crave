"""Generate burgerking_items.json from the US Burger King menu.

Burger King is the app's 5th restaurant (Track D). It's a top-3 US chain and a direct burger
competitor to McDonald's and Wendy's, so it expands the cross-restaurant comparison where it's most
useful. The menu maps cleanly onto the category vocabulary the app already uses, so the scorer /
optimizer (recommend_items.py) need no change.

Like Wendy's, Burger King publishes per-item nutrition pages but no clean US export to parse
(unlike parse_tacobell.py). Values below were compiled online in **June 2026** from multiple US
nutrition databases (FatSecret, MyFoodDiary, fastfoodnutrition.org, CalorieKing, Nutritionix) with
per-item consensus/cross-check. They are internally consistent and US-correct, but not
official-exact; a few source-disputed values are best estimates (noted EST inline). The full table
was reviewed by the user before build (the Wendy's checkpoint precedent).

item_id is 700000 + n (int) — a fresh numeric range so it never collides in ITEMS_BY_ID
(McDonald's ~2xxxxx, Taco Bell 6xxxxx; keyed on str(item_id)). Categories reuse the existing
vocabulary: burgers/chicken/breakfast (entrees), sides/desserts (sides), drinks. item_type =
food | drink. Re-run anytime: idempotent, overwrites burgerking_items.json. If a value looks off,
edit the table here and re-run — do not hand-edit the JSON.

Usage:  python build_burgerking_us.py
"""

import json
from pathlib import Path

OUT = Path(__file__).parent / "burgerking_items.json"
ID_BASE = 700000

# (name, category, item_type, calories, fat, carbohydrate, sugars, protein, sodium)
ITEMS = [
    # --- burgers ---
    ("Whopper",                  "burgers", "food",  670, 39, 54, 13, 31, 1170),
    ("Whopper Jr.",              "burgers", "food",  340, 18, 30,  7, 15,  560),
    ("Double Whopper",           "burgers", "food",  920, 58, 54, 13, 52, 1240),
    ("Triple Whopper",           "burgers", "food", 1170, 78, 56, 13, 72, 1300),
    ("Bacon King",               "burgers", "food", 1260, 84, 58, 14, 69, 2330),  # cal/sodium EST
    ("Big King XL",              "burgers", "food",  980, 63, 51, 11, 56, 1660),
    ("Hamburger",                "burgers", "food",  250, 10, 29,  7, 13,  560),
    ("Cheeseburger",             "burgers", "food",  290, 13, 31,  7, 15,  780),  # variance EST
    ("Double Cheeseburger",      "burgers", "food",  450, 26, 28,  7, 27,  910),  # variance EST
    ("Bacon Cheeseburger",       "burgers", "food",  340, 16, 31,  7, 18,  940),

    # --- chicken ---
    ("Original Chicken Sandwich",   "chicken", "food", 660, 40, 49, 7, 25, 1100),
    ("Royal Crispy Chicken",        "chicken", "food", 600, 31, 54, 9, 31, 1330),
    ("Spicy Royal Crispy Chicken",  "chicken", "food", 760, 49, 58, 9, 31, 1580),  # sugar EST
    ("Chicken Fries (9 Pc)",        "chicken", "food", 280, 17, 20, 0, 13,  850),
    ("8 Pc Chicken Nuggets",        "chicken", "food", 390, 25, 23, 0, 18,  990),
    ("4 Pc Chicken Nuggets",        "chicken", "food", 190, 12, 12, 0,  9,  490),

    # --- sides ---
    ("Small Fries",              "sides", "food", 340, 16, 44, 0, 4,  480),
    ("Medium Fries",             "sides", "food", 380, 17, 51, 1, 4,  570),
    ("Large Fries",              "sides", "food", 510, 24, 67, 1, 6,  760),
    ("Onion Rings (Medium)",     "sides", "food", 360, 19, 40, 4, 4,  460),  # size varies EST
    ("Mozzarella Sticks (8 Pc)", "sides", "food", 480, 24, 44, 3, 19, 1080),  # interp 4pc/12pc EST

    # --- breakfast ---
    ("Sausage, Egg & Cheese Croissan'wich", "breakfast", "food", 500, 33, 26, 5, 18, 980),  # EST
    ("Bacon, Egg & Cheese Croissan'wich",   "breakfast", "food", 390, 23, 27, 4, 15, 810),  # EST
    ("French Toast Sticks (5 Pc)",          "breakfast", "food", 380, 18, 49, 13, 5, 430),
    ("Hash Browns (Small)",                 "breakfast", "food", 230, 15, 23, 0,  2, 440),

    # --- desserts ---
    ("Chocolate Shake",          "desserts", "food", 590, 14, 103, 84, 13, 420),
    ("Vanilla Shake",            "desserts", "food", 560, 14,  96, 89, 12, 310),
    ("Hershey's Sundae Pie",     "desserts", "food", 310, 18,  32, 22,  3, 210),
    ("Soft Serve Cone",          "desserts", "food", 190,  5,  29, 23,  5,  90),  # EST

    # --- drinks (medium fountain ~22oz; sizes vary by location) ---
    ("Coca-Cola (Medium)",       "drinks", "drink", 290, 0, 78, 78, 0, 25),  # size-dependent EST
    ("Diet Coke (Medium)",       "drinks", "drink",   0, 0,  0,  0, 0, 40),
    ("Sprite (Medium)",          "drinks", "drink", 290, 0, 78, 76, 0, 70),
    ("Dr Pepper (Medium)",       "drinks", "drink", 280, 0, 73, 60, 0, 70),
    ("Coffee",                   "drinks", "drink",   5, 0,  1,  0, 0,  5),
    ("Bottled Water",            "drinks", "drink",   0, 0,  0,  0, 0,  0),
]


def build():
    out = []
    for n, (name, category, item_type, cal, fat, carb, sugar, protein, sodium) in enumerate(ITEMS):
        out.append({
            "item_id": ID_BASE + n,     # fresh int range, no collision with McD/Taco Bell
            "name": name,
            "restaurant": "burgerking",
            "category": category,
            "item_type": item_type,
            "calories": float(cal),
            "protein": float(protein),
            "fat": float(fat),
            "carbohydrate": float(carb),
            "sugars": float(sugar),
            "sodium": int(sodium),
        })
    return out


def main():
    items = build()
    ids = [it["item_id"] for it in items]
    if len(ids) != len(set(ids)):
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        raise SystemExit(f"Duplicate item_ids: {dupes}")

    OUT.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    from collections import Counter
    print(f"WROTE {OUT.name} ({len(items)} items)")
    for cat, n in sorted(Counter(i["category"] for i in items).items()):
        print(f"  {n:2}  {cat}")


if __name__ == "__main__":
    main()
