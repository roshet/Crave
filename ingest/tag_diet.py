"""Derive `vegetarian` and `vegan` booleans for every item across all 5 datasets
and write them back into the JSON files. Idempotent — re-running yields a no-op diff.

We have NO ingredient data, only name + category + macros, so diet status is
*derived*: keyword matches on the name, plus category defaults, plus explicit
per-item override tables for whatever the heuristics get wrong.

Conservative bias: mark True only when confident; ambiguity stays False. Showing a
meat item to a vegetarian (or a dairy/egg item to a vegan) is the failure we avoid.
Vegan is a strict subset of vegetarian and leans harder on overrides, since dairy
and egg are frequently invisible in product names.

Re-run after editing any OVERRIDES table:  python tag_diet.py
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
    "carne", "asada", "chorizo", "baconator", "dave's", "whopper", "big mac",
    "quarter pounder", "mcdouble", "blt", "anchov",
}

# Categories whose items are vegetarian by default UNLESS a non-veg keyword fires.
VEG_DEFAULT_CATEGORIES = {
    "drinks", "beverages", "mccafe_coffees", "desserts", "sweets", "sauces",
    "dressings", "buns",
}

# Substrings (lowercased) that mark an otherwise-vegetarian item as NOT vegan:
# dairy, egg, honey, and dairy-dessert/drink signals. Matched against full names.
NON_VEGAN_KEYWORDS = {
    "cheese", "cheesy", "milk", "cream", "creamy", "butter", "egg", "mayo",
    "ranch", "yogurt", "parfait", "shake", "float", "latte", "cappuccino",
    "mocha", "frappe", "frosted", "queso", "honey", "custard", "icedream",
    "sundae", "mcflurry", "cheddar", "parmesan", "aioli", "alfredo",
    # dairy-implying drink/dessert signals (review gate additions):
    "dirty", "churro", "chiller", "matcha", "crema", "smoothie", "hot chocolate",
    "frosty", "dream", "cinnabon",
}

# Categories whose items are vegan by default UNLESS a non-vegan keyword fires.
# Deliberately narrow: only fountain drinks/teas/lemonades/water reliably qualify
# (milkshakes/lattes are caught by NON_VEGAN_KEYWORDS). Sides/buns/sauces are NOT
# here — they carry name-invisible dairy/egg/tallow, so they stay override-driven.
VEGAN_DEFAULT_CATEGORIES = {"drinks", "beverages"}

# Explicit per-item vegan corrections, keyed on str(item_id). Populated during the
# review gate (Step 8). Value is the FINAL vegan boolean. NEVER set True for a
# non-vegetarian item (a test asserts the subset invariant).
VEGAN_OVERRIDES: dict[str, bool] = {
    # --- mcdonalds ---
    '200068': True,                                        # McDonald's | Apple Slices
    # --- wendys ---
    'Plain Baked Potato': True,                            # Wendy's | Plain Baked Potato
    'Small Fries': True,                                   # Wendy's | Small Fries
    'Medium Fries': True,                                  # Wendy's | Medium Fries
    'Large Fries': True,                                   # Wendy's | Large Fries
    # --- burgerking ---
    '700016': True,                                        # Burger King | Small Fries
    '700017': True,                                        # Burger King | Medium Fries
    '700018': True,                                        # Burger King | Large Fries
    '700024': True,                                        # Burger King | Hash Browns (Small)
    # --- chickfila — True (plant-based) ---
    'chickfila_chick_fil_a_waffle_potato_fries': True,     # Chick-fil-A | Chick-fil-A Waffle Potato Fries
    'chickfila_original_flavor_waffle_potato_chips': True, # Chick-fil-A | Original Flavor Waffle Potato Chips
    'chickfila_buddy_fruits_apple_sauce': True,            # Chick-fil-A | Buddy Fruits Apple Sauce
    'chickfila_fruit_cup': True,                           # Chick-fil-A | Fruit Cup
    'chickfila_kale_crunch_side': True,                    # Chick-fil-A | Kale Crunch Side
    'chickfila_saltines': True,                            # Chick-fil-A | Saltines
    # --- chickfila — False (milk-based coffees that leaked via drinks default) ---
    'chickfila_iced_coffee': False,                        # Chick-fil-A | Iced Coffee
    'chickfila_peppermint_iced_coffee': False,             # Chick-fil-A | Peppermint Iced Coffee
    'chickfila_peppermint_coffee': False,                  # Chick-fil-A | Peppermint Coffee
    # --- tacobell ---
    '600134': True,                                        # Taco Bell | Black Beans
    '600133': True,                                        # Taco Bell | Black Beans & Rice
    '600138': True,                                        # Taco Bell | Cinnamon Twists
    '600207': True,                                        # Taco Bell | Hash Brown
}


def _has_vegan_signal(item: dict) -> bool:
    """Vegan-specific heuristic only — does NOT re-check meat. The vegetarian gate
    lives in _is_vegan's composing rule."""
    name = (item.get("name") or "").lower()
    if any(kw in name for kw in NON_VEGAN_KEYWORDS):
        return False
    category = (item.get("category") or "").lower()
    if category in VEGAN_DEFAULT_CATEGORIES:
        return True
    # Unknown territory: conservative default is False.
    return False


def _is_vegan(item: dict) -> bool:
    item_id = str(item.get("item_id"))
    if item_id in VEGAN_OVERRIDES:
        return VEGAN_OVERRIDES[item_id]
    # Subset invariant: must be vegetarian first.
    return _is_vegetarian(item) and _has_vegan_signal(item)


# Explicit per-item corrections, keyed on str(item_id). Populated during review:
# run the script, inspect the printed report, and add entries for misclassifications
# (e.g. a cheese-only quesadilla the keywords wrongly flagged, or a "garden salad"
# that actually ships with chicken). Value is the FINAL vegetarian boolean.
OVERRIDES: dict[str, bool] = {
    # --- mcdonalds ---
    '200066': True,  # fries_sides | Small French Fries
    '200068': True,  # fries_sides | Apple Slices
    '200340': True,  # breakfast | Hash Browns
    '200325': True,  # breakfast | Hotcakes
    '201306': True,  # breakfast | Bagel Plain
    '200876': True,  # breakfast | Egg and Cheese Bagel
    '200284': True,  # breakfast | Fruit & Maple Oatmeal
    # --- chickfila ---
    'chickfila_berry_parfait': True,  # sides | Berry Parfait
    'chickfila_fruit_cup': True,  # sides | Fruit Cup
    'chickfila_kale_crunch_side': True,  # sides | Kale Crunch Side
    'chickfila_chick_fil_a_waffle_potato_fries': True,  # sides | Chick-fil-A Waffle Potato Fries
    'chickfila_mac_cheese': True,  # sides | Mac & Cheese
    'chickfila_side_salad': True,  # sides | Side Salad
    'chickfila_original_flavor_waffle_potato_chips': True,  # sides | Original Flavor Waffle Potato Chips
    'chickfila_buddy_fruits_apple_sauce': True,  # sides | Buddy Fruits Apple Sauce
    'chickfila_chick_fil_a_sauce_flavored_waffle_potato_chips': True,  # sides | Chick-fil-A Sauce Flavored Waffle Potato Chips
    'chickfila_saltines': True,  # sides | Saltines
    'chickfila_peppermint_chip_milkshake': True,  # kid_s_meals | Peppermint Chip Milkshake
    'chickfila_chocolate_fudge_brownie': True,  # kid_s_meals | Chocolate Fudge Brownie
    'chickfila_frosted_lemonade': True,  # kid_s_meals | Frosted Lemonade
    'chickfila_frosted_coffee': True,  # kid_s_meals | Frosted Coffee
    'chickfila_chocolate_chunk_cookie': True,  # kid_s_meals | Chocolate Chunk Cookie
    'chickfila_peppermint_chip_frosted_coffee': True,  # kid_s_meals | Peppermint Chip Frosted Coffee
    'chickfila_cookies_cream_milkshake': True,  # kid_s_meals | Cookies & Cream Milkshake
    'chickfila_chocolate_milkshake': True,  # kid_s_meals | Chocolate Milkshake
    'chickfila_strawberry_milkshake': True,  # kid_s_meals | Strawberry Milkshake
    'chickfila_vanilla_milkshake': True,  # kid_s_meals | Vanilla Milkshake
    'chickfila_chick_fil_a_icedream_cone': True,  # kid_s_meals | Chick-fil-A Icedream Cone
    'chickfila_chick_fil_a_icedream_cup': True,  # kid_s_meals | Chick-fil-A Icedream Cup
    'chickfila_dr_pepper_float': True,  # kid_s_meals | Dr Pepper Float
    'chickfila_gallon_beverages': True,  # catering | Gallon Beverages
    'chickfila_seasonal_gallon_beverages': True,  # catering | Seasonal Gallon Beverages
    'chickfila_fruit_tray': True,  # catering | Fruit Tray
    'chickfila_mac_cheese_tray': True,  # catering | Mac & Cheese Tray
    'chickfila_garden_salad_tray': True,  # catering | Garden Salad Tray
    'chickfila_kale_crunch_side_tray': True,  # catering | Kale Crunch Side Tray
    'chickfila_chocolate_chunk_cookie_tray': True,  # catering | Chocolate Chunk Cookie Tray
    'chickfila_chocolate_fudge_brownie_tray': True,  # catering | Chocolate Fudge Brownie Tray
    'chickfila_cookie_brownie_tray': True,  # catering | Cookie & Brownie Tray
    'chickfila_southwest_veggie_wrap_trays': True,  # catering | Southwest Veggie Wrap Trays
    'chickfila_gallon_chick_fil_a_lemonade': True,  # catering | Gallon Chick-fil-A Lemonade
    'chickfila_gallon_chick_fil_a_diet_lemonade': True,  # catering | Gallon Chick-fil-A Diet Lemonade
    'chickfila_gallon_chick_fil_a_lemonade_1_2_lemonade_1_2_diet_lemonade': True,  # catering | Gallon Chick-fil-A Lemonade (1/2 Lemonade, 1/2 Diet Lemonade)
    'chickfila_gallon_freshly_brewed_iced_tea_sweetened': True,  # catering | Gallon Freshly-Brewed Iced Tea Sweetened
    'chickfila_gallon_freshly_brewed_iced_tea_unsweetened': True,  # catering | Gallon Freshly-Brewed Iced Tea Unsweetened
    'chickfila_gallon_chick_fil_a_iced_tea_1_2_sweet_tea_1_2_unsweet_tea': True,  # catering | Gallon Chick-fil-A Iced Tea (1/2 Sweet Tea, 1/2 Unsweet Tea)
    'chickfila_gallon_sunjoy_1_2_sweet_tea_1_2_lemonade': True,  # catering | Gallon Sunjoy (1/2 Sweet Tea, 1/2 Lemonade)
    'chickfila_gallon_sunjoy_1_2_sweet_tea_1_2_diet_lemonade': True,  # catering | Gallon Sunjoy (1/2 Sweet Tea, 1/2 Diet Lemonade)
    'chickfila_gallon_sunjoy_1_2_unsweet_tea_1_2_lemonade': True,  # catering | Gallon Sunjoy (1/2 Unsweet Tea, 1/2 Lemonade)
    'chickfila_gallon_sunjoy_1_2_unsweet_tea_1_2_diet_lemonade': True,  # catering | Gallon Sunjoy (1/2 Unsweet Tea, 1/2 Diet Lemonade)
    'chickfila_hash_browns': True,  # breakfast | Hash Browns
    'chickfila_breakfast_breads': True,  # breakfast | Breakfast Breads
    'chickfila_american_cheese': True,  # sandwich_toppings | American Cheese
    'chickfila_colby_jack_cheese': True,  # sandwich_toppings | Colby Jack Cheese
    'chickfila_pepper_jack_cheese': True,  # sandwich_toppings | Pepper Jack Cheese
    'chickfila_tomato': True,  # sandwich_toppings | Tomato
    'chickfila_lettuce': True,  # sandwich_toppings | Lettuce
    'chickfila_roasted_nut_blend': True,  # salad_toppings | Roasted Nut Blend
    'chickfila_harvest_nut_granola': True,  # salad_toppings | Harvest Nut Granola
    'chickfila_seasoned_tortilla_strips': True,  # salad_toppings | Seasoned Tortilla Strips
    'chickfila_blue_cheese_crumbles': True,  # salad_toppings | Blue Cheese Crumbles
    'chickfila_crispy_bell_peppers': True,  # salad_toppings | Crispy Bell Peppers
    'chickfila_chili_lime_pepitas': True,  # salad_toppings | Chili Lime Pepitas
    # --- wendys ---
    'Small Fries': True,  # sides | Small Fries
    'Medium Fries': True,  # sides | Medium Fries
    'Large Fries': True,  # sides | Large Fries
    'Plain Baked Potato': True,  # sides | Plain Baked Potato
    'Sour Cream & Chives Potato': True,  # sides | Sour Cream & Chives Potato
    'Seasoned Potatoes': True,  # sides | Seasoned Potatoes
    # --- tacobell ---
    '600105': True,  # burritos | Bean Burrito
    '600107': True,  # burritos | Black Bean Grilled Cheese Burrito
    '600111': True,  # burritos | Cheesy Bean & Rice Burrito
    '600127': True,  # specialties | Black Bean Crunchwrap Supreme
    '600128': True,  # specialties | Cheesy Roll Up
    '600132': True,  # specialties | Veggie Mexican Pizza
    '600089': True,  # tacos | Black Bean Chalupa Supreme
    '600104': True,  # tacos | Spicy Potato Soft Taco
    '600123': True,  # quesadillas | Quesadilla - Cheese
    '600118': True,  # nachos | Chips and Nacho Cheese Sauce
    '600133': True,  # sides | Black Beans & Rice
    '600134': True,  # sides | Black Beans
    '600135': True,  # sides | Cheesy Fiesta Potatoes
    '600145': True,  # sides | Pintos N Cheese
    '600144': True,  # sides | Nacho Fries
    '600142': True,  # sides | Large Nacho Fries
    '600207': True,  # breakfast | Hash Brown
    '600202': True,  # breakfast | Cinnabon Delights (2 Pack)
    '600203': True,  # breakfast | Cinnabon Delights (12 Pack - Serves 4)
    '600200': True,  # breakfast | Cheesy Toasted Breakfast Burrito - Fiesta Potato
    # --- burgerking ---
    '700016': True,  # sides | Small Fries
    '700017': True,  # sides | Medium Fries
    '700018': True,  # sides | Large Fries
    '700019': True,  # sides | Onion Rings (Medium)
    '700020': True,  # sides | Mozzarella Sticks (8 Pc)
    '700023': True,  # breakfast | French Toast Sticks (5 Pc)
    '700024': True,  # breakfast | Hash Browns (Small)
}


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
        vegan_count = 0
        for item in _iter_items(data):
            veg = _is_vegetarian(item)
            vegan = _is_vegan(item)
            item["vegetarian"] = veg
            item["vegan"] = vegan
            if veg:
                veg_count += 1
            if vegan:
                vegan_count += 1
            report.append((filename, str(item.get("item_id")), item.get("name"), veg, vegan))

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")

        total = sum(1 for _ in _iter_items(data))
        print(f"{filename}: {veg_count}/{total} vegetarian, {vegan_count}/{total} vegan")

    # Full per-item report for review of the heuristics.
    print("\n--- items tagged VEGAN (review for false positives) ---")
    for fn, iid, name, veg, vegan in report:
        if vegan:
            print(f"  VEGAN  {fn:24} {name}")

    print("\n--- vegetarian-but-NOT-vegan (review for false negatives) ---")
    for fn, iid, name, veg, vegan in report:
        if veg and not vegan:
            print(f"  veg-only  {fn:24} {name}")


if __name__ == "__main__":
    main()
