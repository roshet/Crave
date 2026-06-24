"""Derive a `vegetarian` boolean for every item across all 5 datasets and write it
back into the JSON files. Idempotent — re-running yields a no-op diff.

We have NO ingredient data, only name + category + macros, so vegetarian status is
*derived*: a non-vegetarian keyword match on the name, plus category defaults, plus
an explicit per-item OVERRIDES table for whatever the heuristic gets wrong.

Conservative bias: mark True only when confident; ambiguity stays False. Showing a
meat item to someone filtering vegetarian is the failure we must avoid.

Re-run after editing OVERRIDES:  python tag_vegetarian.py
"""

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DATASETS = [
    "mcdonalds_items.json",
    "chickfila_items.json",
    "wendys_items.json",
    "tacobell_items.json",
    "burgerking_items.json",
]

# Substrings (lowercased) that mark an item as NOT vegetarian. Word-ish fragments are
# fine because we match against full product names. Keep meat/seafood terms only.
NON_VEG_KEYWORDS = {
    "bacon", "beef", "burger", "hamburger", "cheeseburger", "chicken", "mcchicken",
    "nugget", "mcnugget", "sausage", "ham", "pepperoni", "steak", "filet", "fish",
    "fillet", "mcrib", "rib", "brisket", "turkey", "pork", "meat", "spicy chicken",
    "grilled chicken", "crispy chicken", "strips", "tender", "wing", "shrimp",
    "carne", "asada", "chorizo", "baconator", "dave's", "jr.", "whopper", "big mac",
    "quarter pounder", "mcdouble", "club", "blt", "anchov",
}

# Categories whose items are vegetarian by default UNLESS a non-veg keyword fires.
VEG_DEFAULT_CATEGORIES = {
    "drinks", "beverages", "mccafe_coffees", "desserts", "sweets", "sauces",
    "dressings", "buns",
}

# Explicit per-item corrections, keyed on str(item_id). Populated during review:
# run the script, inspect the printed report, and add entries for misclassifications
# (e.g. a cheese-only quesadilla the keywords wrongly flagged, or a "garden salad"
# that actually ships with chicken). Value is the FINAL vegetarian boolean.
OVERRIDES: dict[str, bool] = {}


def _is_vegetarian(item: dict) -> bool:
    item_id = str(item.get("item_id"))
    if item_id in OVERRIDES:
        return OVERRIDES[item_id]

    name = (item.get("name") or "").lower()
    if any(kw in name for kw in NON_VEG_KEYWORDS):
        return False

    category = (item.get("category") or "").lower()
    if category in VEG_DEFAULT_CATEGORIES:
        return True

    # Unknown territory (e.g. a generic "specialties"/"entrees" item with no meat word):
    # conservative default is False — better to hide a veg item than show a meat one.
    return False


def _iter_items(data):
    """Yield item dicts whether the file is a list or an id-keyed dict."""
    return data.values() if isinstance(data, dict) else data


def main():
    report = []
    for filename in DATASETS:
        path = BASE_DIR / filename
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        veg_count = 0
        for item in _iter_items(data):
            veg = _is_vegetarian(item)
            item["vegetarian"] = veg
            if veg:
                veg_count += 1
            report.append((filename, str(item.get("item_id")), item.get("name"), veg))

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")

        total = sum(1 for _ in _iter_items(data))
        print(f"{filename}: {veg_count}/{total} vegetarian")

    # Full per-item report for review of the heuristic.
    print("\n--- items tagged vegetarian (review for false positives) ---")
    for fn, iid, name, veg in report:
        if veg:
            print(f"  VEG  {fn:24} {name}")


if __name__ == "__main__":
    main()
