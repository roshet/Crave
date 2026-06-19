# Add Burger King (5th restaurant) — Design

**Date:** 2026-06-19
**Status:** Approved
**Track:** D (new data source)

## Problem

The app compares fast-food nutrition across restaurants (`restaurant=all`). All four current
chains — McDonald's, Chick-fil-A, Wendy's, Taco Bell — are now US data. **Burger King** is a top-3
US chain and a direct burger competitor to McDonald's and Wendy's, so adding it expands the
comparison set where it's most useful. BK's menu maps cleanly onto the category vocabulary the app
already uses, so this is a pure data-add plus the standard backend/frontend wiring — no scoring
change.

## Decision

Add a 40-item US Burger King core menu spanning the existing categories: `burgers` (10),
`chicken` (6), `sides` (5), `breakfast` (4), `desserts` (4), `drinks` (6). Follows the Taco Bell /
Wendy's-US restaurant-add precedent.

### Sourcing

Like Wendy's, Burger King has **no clean official US PDF** to parse (BK publishes per-item pages,
not a single export). Values were compiled **online (June 2026)** from multiple US nutrition
databases (FatSecret, MyFoodDiary, fastfoodnutrition.org, CalorieKing, Nutritionix) with per-item
consensus/cross-check. Provenance is "compiled US consensus, June 2026" — not official-exact, but
internally consistent. A handful of source-disputed values are best estimates (noted EST/⚠️ in the
generator): Bacon King (calorie/sodium variance), Cheeseburger/Double Cheeseburger (patty spec),
Mozzarella Sticks 8-pc (interpolated from BK's published 4-pc and 12-pc), the Croissan'wich
breakfast items (470–542 cal range), and fountain sodas (sized to a medium ~22oz). **The full
table was reviewed by the user before build** (same checkpoint as Wendy's).

## Approach

### Generator (no PDF → explicit table)
`ingest/build_burgerking_us.py` mirrors `build_wendys_us.py`: holds the 40 items as an explicit
`name → (cat, type, macros)` table and emits `burgerking_items.json`. Auditable, idempotent,
re-runnable (NOT hand-edited JSON). Header cites sources + capture date. If a value ever looks off,
edit the table and re-run — don't hand-edit the JSON.

- **id scheme:** `item_id = 700000 + n` (int) — a fresh numeric range. McDonald's is ~2xxxxx and
  Taco Bell is 6xxxxx, so 7xxxxx never collides in `ITEMS_BY_ID` (keyed on `str(item_id)`). Unlike
  Wendy's (human-name ids), BK uses ints like McDonald's/Taco Bell.
- **Categories** reuse the existing vocabulary so the scorer/optimizer need no change:
  `burgers`/`chicken`/`breakfast` ∈ `entree_categories`, `sides`/`desserts` ∈ `side_categories`,
  drinks via `item_type == "drink"`. No `recommend_items.py` change.
- **Shape:** existing list-of-objects with `item_id, name, restaurant:"burgerking", category,
  item_type, calories, protein, fat, carbohydrate, sugars, sodium`. JSON key is `carbohydrate`
  (singular). `item_type` = `food` | `drink`.

### Backend (`ingest/api.py`) — mirror the 4 existing restaurants
1. Load: `burgerking_items = _load_json(BASE_DIR / "burgerking_items.json")`.
2. `ALL_ITEMS += burgerking_items` (so `ITEMS_BY_ID`, imputed-sodium median, `/items` pick it up).
3. `/health` `restaurants` dict: add `"burgerking": len(burgerking_items)`.
4. Restaurant param regex in **three** routes (`/recommend`, `/categories`, `/optimize_meal`):
   `^(mcdonalds|chickfila|wendys|tacobell|burgerking|all)$`.
5. `/recommend` + `/categories` if/elif chains: add a `burgerking` branch.
6. `/optimize_meal` `per_restaurant` dict: add `"burgerking": burgerking_items`.

`recommend_items.py`: **no change.**

### Frontend (`fast-food-ui/src/App.jsx`)
Add `BURGERKING_CATEGORIES` (burgers/chicken/sides/breakfast/desserts/drinks) after
`TACOBELL_CATEGORIES`; add `restaurant === "burgerking" ? BURGERKING_CATEGORIES :` to the
category-selector ternary; add `<option value="burgerking">Burger King</option>` to the restaurant
select. `CATEGORY_EMOJI` already covers all six categories.

### Tests (`ingest/test_api.py`)
`/health` sum-equals-total auto-covers the new count. Add a BK sanity invariant (Whopper present
with sane US calories; BK has burgers + drinks). Confirm `optimize_meal?restaurant=burgerking`
returns a meal (entree+side+drink present).

### Docs
Update `CLAUDE.md` (dataset list / restaurant enums) and `README` to include Burger King +
`burgerking_items.json`.

## Out of scope
Official-exact sourcing (no clean US source exists); seasonal/LTO items; impossible/plant-based
items; per-region drink size variants beyond a single medium.

## Verification
- Run generator; spot-check Whopper / a chicken sandwich / fries / a soda vs a 2nd source.
- `cd ingest && python -c "import api" && pytest`.
- `cd fast-food-ui && npm run lint && npm run build`.
- Local TestClient smoke: `/health` shows burgerking count; `/recommend?restaurant=burgerking`
  returns US values; `/optimize_meal?restaurant=burgerking` builds a meal; `restaurant=all`
  includes BK; `/categories?restaurant=burgerking` lists the categories.
- Live after deploy: same checks on Render `/health` + a BK recommend.

## Delivery
Branch `track-d-burgerking` → spec commit first → generator + JSON + backend + frontend + tests +
docs → PR (CI gates main) → user OK → merge (prod deploy) → verify live.
