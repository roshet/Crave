# Crave Data Quality Cleanup — Design Spec

**Date:** 2026-06-11
**Scope:** Fix scrambled Chick-fil-A categories + non-food junk, and fill Wendy's missing sodium with real sourced values. Touches `ingest/` data + the optimizer category set + minor frontend emoji.
**Prior context:** This is the "Data quality" track from the project review (Track A — UX/a11y — shipped in PR #3).

---

## Context

Two data defects, found during planning, that have functional impact:

1. **Wendy's sodium gap.** 34/41 Wendy's items (all `item_type:food`) have an empty `sodium` field. `api.py` masks this with median imputation (`IMPUTED_SODIUM_MG`, ~660mg), so every Wendy's burger/chicken item is scored on the *same* fabricated sodium — sodium effectively can't differentiate Wendy's food. The 7 drinks have real values.

2. **Chick-fil-A scrambled categories.** The `ingest_chickfila_items.py` scrape misaligned sidebar sections against items, producing:
   - Non-food junk as `item_type:food`: Ice Scoop, Ice Bucket and Scoop, Bag of Ice, plus "Ice Products" (in `drinks` as `item_type:drink`).
   - 21 beverages (bottled teas/lemonades, milk, water, juice, coffee, gallons) labeled `catering_entrees`/`item_type:food`.
   - Salad dressings labeled `buns`; buns labeled `proteins`; sauces labeled `dressings`; catering trays + "Grilled Chicken Bundle" labeled `soup_toppings`.

   Because the optimizer's entrée set **includes `catering_entrees`**, and `drinks` holds a 2190-cal "Gallon Beverages" + "Ice Products", the optimizer can pick *ice* or a *gallon of lemonade* as a meal component.

The runtime loads the committed `.json`, not the scraper, and re-scraping needs Playwright on the live site. So we correct the JSON directly via reviewable remediation scripts kept in the repo for provenance (mirrors `parse_tacobell.py`).

---

## Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Wendy's sodium source | Web-research official published values | Most accurate self-serve path; imputation is a fabrication |
| Unconfirmable items | Leave null + call out | Don't guess; imputation safety-net still covers them |
| Chick-fil-A scope | Full cleanup | Half-fixing leaves the optimizer-junk bug |
| Catering/gallon/tray items | Keep in Browse, category `catering` (no optimizer set) | "Exclude from meal-building" without deleting menu info |
| Condiments (sauces/dressings) | `item_type:"sauce"` | Hidden from Browse + optimizer, matching the Taco Bell condiment pattern |
| Fix mechanism | Explicit `{item_id: action}` tables in scripts | Reviewable, reproducible, provenance in repo |

---

## Chick-fil-A remap rules

- **Remove** (non-food): `chickfila_ice_scoop`, `chickfila_ice_bucket_and_scoop`, `chickfila_bag_of_ice`, `chickfila_ice_products`.
- **→ `entrees`** (real individual items wrongly in `catering_entrees`): Chick-fil-A Nuggets, Spicy Chicken Sandwich, Chick-fil-A Chicken Sandwich, the two Chilled Grilled Chicken Sub Sandwiches.
- **→ `drinks` + `item_type:"drink"`** (individual beverages): DASANI Water, Honest Kids Apple Juice, Simply Orange, 1% Milk, 1% Chocolate Milk, Bottled Sweet/Unsweet Tea, Bottled (Diet) Lemonade, Catering Coffee.
- **→ `catering` + `item_type:"food"`** (multi-serve, Browse-only): all `Gallon *`, `Seasonal Gallon Beverages`, the existing `drinks` "Gallon Beverages", and the trays/bundle in `soup_toppings`.
- **→ `item_type:"sauce"`**: sauces (currently `dressings`) → category `sauces`; salad dressings (currently `buns`) → category `dressings`.
- **Components** (Browse-only, not in optimizer): `* Bun` (currently `proteins`) → `buns`; filets/sausage stay; `sandwich_toppings`/`salad_toppings` unchanged; Saltines → `sides`.

Then in `recommend_items.py` `build_optimal_meal`: **remove `"catering_entrees"` from `entree_categories`** (Chick-fil-A-only category; nothing legit relies on it post-remap).

---

## Wendy's sodium

`fix_wendys_sodium.py`: explicit `{item_id: sodium_mg}` from Wendy's official nutrition, applied to the 34 empty fields (burgers 7 / chicken 12 / wraps 4 / salads 2 / sides 9). Header cites source + date; unconfirmed items left null. Wendy's *drink* values remain approximate (out of scope).

---

## Verification

- `python -c "import api"` + `pytest` green; new invariants: junk gone, Wendy's food sodium non-null, no optimized Chick-fil-A meal contains `catering`/"Gallon"/"Tray", condiments are `sauce`.
- `npm run lint && npm run build`.
- Local smoke: `/health` chickfila count drops by removed junk; Wendy's `/recommend` shows real sodium; `/optimize_meal?restaurant=chickfila` (balanced/high_protein/low_fat) returns only real single-serve items.
