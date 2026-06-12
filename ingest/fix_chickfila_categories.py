"""One-off remediation for chickfila_items.json category scramble.

The original Chick-fil-A scrape (ingest_chickfila_items.py) misaligned sidebar
sections against items, so dressings were labeled `buns`, buns labeled `proteins`,
21 beverages dumped into `catering_entrees`, catering trays into `soup_toppings`,
and a few non-food rows (ice) slipped in as food. Because the optimizer's entree
set includes `catering_entrees`, it could pick ice or a gallon of lemonade as a
meal component.

Re-scraping needs Playwright on the live site, so we correct the committed JSON
directly here with an explicit, reviewable id->action table. Idempotent: safe to
re-run. See docs/superpowers/specs/2026-06-11-data-quality-cleanup-design.md.

Usage:  python fix_chickfila_categories.py
"""

import json
from collections import Counter
from pathlib import Path

JSON_PATH = Path(__file__).parent / "chickfila_items.json"

# Non-food rows that shouldn't exist as menu items at all.
REMOVE = {
    "chickfila_ice_scoop",
    "chickfila_ice_bucket_and_scoop",
    "chickfila_bag_of_ice",
    "chickfila_ice_products",
}

# Real individual entrees wrongly filed under catering_entrees.
TO_ENTREE = {
    "chickfila_chick_fil_a_nuggets",
    "chickfila_spicy_chicken_sandwich",
    "chickfila_chick_fil_a_chicken_sandwich",
    "chickfila_chilled_grilled_chicken_sub_sandwich",
    "chickfila_spicy_chilled_grilled_chicken_sub_sandwich",
}

# Individual, single-serve beverages -> real drinks.
TO_DRINK = {
    "chickfila_dasani_bottled_water",
    "chickfila_honest_kids_apple_juice",
    "chickfila_simply_orange",
    "chickfila_1_chocolate_milk",
    "chickfila_1_milk",
    "chickfila_bottled_sweet_tea",
    "chickfila_bottled_unsweet_tea",
    "chickfila_bottled_lemonade",
    "chickfila_bottled_diet_lemonade",
    "chickfila_catering_coffee",
}

# Multi-serve catering (gallons + trays + bundle). Kept browsable but parked in a
# `catering` category that is in NO optimizer set, so they're never meal-built.
TO_CATERING = {
    # gallons / seasonal gallon (were catering_entrees)
    "chickfila_seasonal_gallon_beverages",
    "chickfila_gallon_chick_fil_a_lemonade",
    "chickfila_gallon_chick_fil_a_diet_lemonade",
    "chickfila_gallon_chick_fil_a_lemonade_1_2_lemonade_1_2_diet_lemonade",
    "chickfila_gallon_freshly_brewed_iced_tea_sweetened",
    "chickfila_gallon_freshly_brewed_iced_tea_unsweetened",
    "chickfila_gallon_chick_fil_a_iced_tea_1_2_sweet_tea_1_2_unsweet_tea",
    "chickfila_gallon_sunjoy_1_2_sweet_tea_1_2_lemonade",
    "chickfila_gallon_sunjoy_1_2_sweet_tea_1_2_diet_lemonade",
    "chickfila_gallon_sunjoy_1_2_unsweet_tea_1_2_lemonade",
    "chickfila_gallon_sunjoy_1_2_unsweet_tea_1_2_diet_lemonade",
    # gallon mislabeled as a drink
    "chickfila_gallon_beverages",
    # trays + bundle (were soup_toppings)
    "chickfila_grilled_chicken_bundle",
    "chickfila_chick_fil_a_nugget_trays",
    "chickfila_chilled_chick_fil_a_nugget_trays",
    "chickfila_chick_n_stripstm_trays",
    "chickfila_chilled_chick_n_strips_trays",
    "chickfila_chilled_grilled_chicken_sub_sandwich_tray",
    "chickfila_spicy_chilled_grilled_chicken_sub_sandwich_tray",
    "chickfila_chick_fil_a_cool_wrap_trays",
    "chickfila_southwest_veggie_wrap_trays",
    "chickfila_spicy_cool_wrap_trays",
    "chickfila_fruit_tray",
    "chickfila_mac_cheese_tray",
    "chickfila_garden_salad_tray",
    "chickfila_kale_crunch_side_tray",
    "chickfila_chocolate_chunk_cookie_tray",
    "chickfila_chocolate_fudge_brownie_tray",
    "chickfila_cookie_brownie_tray",
}

# Dipping sauces (were `dressings`) -> category `sauces`, item_type sauce (hidden).
TO_SAUCE = {
    "chickfila_barbeque_sauce",
    "chickfila_chick_fil_a_sauce",
    "chickfila_garden_herb_ranch_sauce",
    "chickfila_honey_mustard_sauce",
    "chickfila_polynesian_sauce",
    "chickfila_sweet_spicy_sriracha_sauce",
    "chickfila_zesty_buffalo_sauce",
    "chickfila_honey_roasted_bbq_sauce",
}

# Salad dressings (were mislabeled `buns`) -> category `dressings`, item_type sauce.
TO_DRESSING = {
    "chickfila_avocado_lime_ranch_dressing",
    "chickfila_creamy_salsa_dressing",
    "chickfila_fat_free_honey_mustard_dressing",
    "chickfila_garden_herb_ranch_dressing",
    "chickfila_light_balsamic_vinaigrette_dressing",
    "chickfila_light_italian_dressing",
    "chickfila_zesty_apple_cider_vinaigrette_dressing",
}

# Actual buns (were mislabeled `proteins`) -> category `buns` (component, food).
TO_BUN = {
    "chickfila_gluten_free_bun",
    "chickfila_buttery_white_bun",
    "chickfila_multigrain_brioche_bun",
    "chickfila_white_bun_unbuttered",
}

# Crackers -> sides.
TO_SIDE = {"chickfila_saltines"}

# (category, item_type) per action group.
ACTIONS = [
    (TO_ENTREE,   ("entrees",   "food")),
    (TO_DRINK,    ("drinks",    "drink")),
    (TO_CATERING, ("catering",  "food")),
    (TO_SAUCE,    ("sauces",    "sauce")),
    (TO_DRESSING, ("dressings", "sauce")),
    (TO_BUN,      ("buns",      "food")),
    (TO_SIDE,     ("sides",     "food")),
]


def main():
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))

    # Validate every referenced id exists (catches typos before mutating).
    referenced = set(REMOVE)
    for ids, _ in ACTIONS:
        referenced |= ids
    missing = referenced - set(data)
    if missing:
        raise SystemExit(f"Unknown item_ids (typo?): {sorted(missing)}")

    before = len(data)
    for item_id in REMOVE:
        del data[item_id]

    changed = 0
    for ids, (category, item_type) in ACTIONS:
        for item_id in ids:
            it = data[item_id]
            if it.get("category") != category or it.get("item_type") != item_type:
                changed += 1
            it["category"] = category
            it["item_type"] = item_type

    JSON_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"Removed {before - len(data)} non-food rows; retagged {changed} items.")
    print(f"Items: {before} -> {len(data)}")
    print("Final category distribution:")
    for cat, n in sorted(Counter(it["category"] for it in data.values()).items()):
        print(f"  {cat}: {n}")


if __name__ == "__main__":
    main()
