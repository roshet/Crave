"""Generate wendys_items.json from the US Wendy's menu.

The Wendy's dataset was previously official UK data (metric; Dave's Single 524 kcal, sodium
derived from the UK "Salt (g)" column). The app and its user are in the US, where those numbers
are wrong for what you'd actually buy and skew cross-restaurant scoring. This re-sources the whole
Wendy's menu (food + drinks + breakfast) to the US menu.

Wendy's publishes nutrition PDFs only for the UK, and the US ordering site has no clean export, so
there is no PDF to parse (unlike parse_tacobell.py). Values below were compiled online in
**June 2026** from multiple US nutrition databases (FatSecret, MyFoodDiary, CalorieKing,
calory.app, MyNetDiary) with per-item consensus/cross-check, anchored to known figures
(Dave's Single 590/1170, Baconator 960/1800). They are consistent and US-correct, but not
official-exact; a few source-disputed values are best estimates (noted inline with EST).

item_id is the human-name string (Wendy's convention) so shared-meal / saved-meal links stay
stable for items that keep their name. Categories reuse the existing vocabulary so the scorer /
optimizer need no change: burgers/chicken/wraps/salads/sides/desserts/breakfast (entrees+sides)
and drinks. Re-run anytime: idempotent, overwrites wendys_items.json.

Usage:  python build_wendys_us.py
"""

import json
from pathlib import Path

OUT = Path(__file__).parent / "wendys_items.json"

# (name, category, item_type, calories, fat, carbohydrate, sugars, protein, sodium)
ITEMS = [
    # --- burgers ---
    ("Dave's Single",            "burgers", "food",  590, 34, 46,  9, 30, 1170),
    ("Dave's Double",            "burgers", "food",  860, 57, 37,  8, 49, 1200),
    ("Dave's Triple",            "burgers", "food", 1090, 73, 41,  9, 71, 1620),
    ("Baconator",                "burgers", "food",  960, 64, 40,  8, 58, 1800),
    ("Son of Baconator",         "burgers", "food",  630, 40, 36,  7, 32, 1210),
    ("Jr. Hamburger",            "burgers", "food",  240, 11, 24,  5, 12,  470),
    ("Jr. Cheeseburger",         "burgers", "food",  290, 14, 26,  6, 16,  630),
    ("Jr. Bacon Cheeseburger",   "burgers", "food",  360, 22, 24,  5, 17,  640),

    # --- chicken ---
    ("Spicy Chicken Sandwich",   "chicken", "food",  490, 20, 49,  5, 29, 1290),
    ("Classic Chicken Sandwich", "chicken", "food",  490, 21, 49,  6, 27, 1310),  # sodium EST
    ("Grilled Chicken Sandwich", "chicken", "food",  380, 10, 38,  8, 35,  840),
    ("Crispy Chicken Sandwich",  "chicken", "food",  340, 17, 32,  4, 15,  640),
    ("Asiago Ranch Chicken Club","chicken", "food",  630, 31, 50,  8, 36, 1800),  # sugar EST
    ("4 Pc Chicken Nuggets",     "chicken", "food",  170, 11, 10,  0, 10,  380),
    ("6 Pc Chicken Nuggets",     "chicken", "food",  250, 16, 14,  0, 13,  570),
    ("10 Pc Chicken Nuggets",    "chicken", "food",  420, 27, 24,  0, 22,  850),
    ("4 Pc Spicy Chicken Nuggets",  "chicken", "food", 190, 12,  9, 0, 10,  480),
    ("6 Pc Spicy Chicken Nuggets",  "chicken", "food", 280, 18, 13, 0, 15,  720),
    ("10 Pc Spicy Chicken Nuggets", "chicken", "food", 470, 31, 22, 0, 26, 1190),

    # --- wraps ---
    ("Grilled Chicken Ranch Wrap", "wraps", "food", 420, 16, 41, 2, 28, 1100),

    # --- salads ---
    ("Taco Salad",               "salads", "food", 660, 32, 63, 18, 32, 1820),
    ("Apple Pecan Chicken Salad","salads", "food", 570, 24, 52, 41, 39, 1030),

    # --- sides ---
    ("Small Fries",              "sides", "food", 260, 12, 35, 0,  4,  420),
    ("Medium Fries",             "sides", "food", 350, 16, 47, 0,  5,  550),
    ("Large Fries",              "sides", "food", 470, 21, 63, 0,  7,  740),
    ("Baconator Fries",          "sides", "food", 490, 28, 45, 1, 14, 1290),  # sodium EST
    ("Small Chili",              "sides", "food", 220,  6, 23, 6, 17,  780),
    ("Plain Baked Potato",       "sides", "food", 270,  0, 61, 3,  7,   40),
    ("Sour Cream & Chives Potato","sides","food", 310,  3, 63, 3,  8,   50),
    ("Seasoned Potatoes",        "sides", "food", 330, 14, 46, 0,  4,  900),

    # --- desserts ---
    ("Small Chocolate Frosty",   "desserts", "food", 350, 9, 58, 47, 10, 150),
    ("Small Vanilla Frosty",     "desserts", "food", 340, 8, 56, 47,  9, 160),

    # --- breakfast ---
    ("Breakfast Baconator",          "breakfast", "food", 730, 50, 37,  7, 34, 1760),
    ("Honey Butter Chicken Biscuit", "breakfast", "food", 500, 29, 44,  8, 14,  970),
    ("Sausage Egg & Cheese Biscuit", "breakfast", "food", 580, 43, 28,  3, 19, 1280),
    ("Bacon Egg & Swiss Croissant",  "breakfast", "food", 410, 23, 34,  6, 18,  900),
    ("Maple Bacon Chicken Croissant","breakfast", "food", 540, 30, 48, 12, 19,  880),
    ("Sausage Egg & Cheese Burrito", "breakfast", "food", 340, 20, 25,  2, 15,  920),

    # --- drinks (small sizes; fountain sizes vary by location) ---
    ("Bottled Water",                "drinks", "drink",   0, 0,  0,  0, 0,   0),
    ("Diet Coke (Small)",            "drinks", "drink",   0, 0,  0,  0, 0,  40),
    ("Unsweetened Iced Tea (Small)", "drinks", "drink",   0, 0,  0,  0, 0,  15),
    ("Coffee",                       "drinks", "drink",   5, 0,  0,  0, 0,   0),
    ("Coca-Cola (Small)",            "drinks", "drink", 180, 0, 48, 48, 0,  50),
    ("Sprite (Small)",               "drinks", "drink", 160, 0, 44, 44, 0,  80),
    ("Sweetened Iced Tea (Small)",   "drinks", "drink", 190, 0, 47, 47, 0,   0),
    ("All-Natural Lemonade (Small)", "drinks", "drink", 180, 0, 49, 45, 0,  15),
    ("Vanilla Frosty-ccino",         "drinks", "drink", 210, 5, 35, 28, 6, 105),
]


def build():
    out = []
    for name, category, item_type, cal, fat, carb, sugar, protein, sodium in ITEMS:
        out.append({
            "item_id": name,            # human-name string id (Wendy's convention)
            "name": name,
            "restaurant": "wendys",
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
