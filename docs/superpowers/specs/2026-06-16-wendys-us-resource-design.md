# Re-source Wendy's to the US Menu — Design

**Date:** 2026-06-16
**Status:** Approved
**Track:** B (data quality)

## Problem

The app is used in the **US**, and McDonald's, Chick-fil-A, and Taco Bell are all US data. But
the Wendy's dataset is official **UK** data in metric units (calories match the UK Core Menu PDF
exactly — Dave's Single = 524 kcal; sodium was *derived* from the UK "Salt (g)" column by
`derive_wendys_sodium.py`). For a US user the numbers are simply wrong for what they'd buy (US
Dave's Single ≈ 590 kcal / 1170 mg sodium; UK sodas are low-sugar from the sugar tax). Because
the app scores nutrition and compares **across** restaurants (`restaurant=all`), a UK Wendy's
makes every cross-restaurant score and the optimizer's picks apples-to-oranges.

This issue is isolated to Wendy's and pre-existing (not a regression). Chick-fil-A was checked and
is already clean (PR #4) — no work there.

## Decision

Re-source the **entire** Wendy's dataset (food + drinks) to the **US** menu. This is a menu
*rebuild*, not just value edits: UK-only items are dropped (Curry Bean Burger, the Mayo/Avocado/
BBQ + Crispy Curry Mayo wraps, Caesar/Avocado Chicken Salad, UK potato/fries variants, 20-pc
nuggets) and US items added (Son of Baconator, Jr. burgers, US chicken sandwiches, Frosties,
baked potatoes, lemonade, breakfast). Breakfast **is** included (user-confirmed).

### Sourcing

Wendy's publishes nutrition **PDFs only for the UK** — the "Core Menu.pdf" is UK. US nutrition
lives in the interactive ordering site and `nutrition-allergens` page; there is **no clean US PDF
to parse**, so the Taco Bell parser precedent does not apply. US values were sourced **online**
(June 2026) from multiple nutrition databases (FatSecret, MyFoodDiary, CalorieKing, calory.app,
MyNetDiary) with per-item consensus/cross-check, anchored to known figures (Dave's Single
590/1170, Baconator 960/1800). Provenance is "compiled US consensus, June 2026" — not
official-exact, but internally consistent and far more correct for a US user than UK data. The
full 47-item table lives in the plan and is encoded in the generator script.

## Approach

### Generator (no PDF → explicit table)
`ingest/build_wendys_us.py` holds the 47 sourced items as an explicit `name → (cat, type, macros)`
table and emits `wendys_items.json`. Auditable, idempotent, re-runnable (NOT hand-edited JSON).
Header cites sources + capture date.

- **id stability:** Wendy's `item_id` is the **human-name string** (`"Dave's Single"`), never a
  number — keep `item_id = name` so shared-meal/saved-meal links survive (opaque-string rule from
  PR #5). Items whose US name differs from the old UK name get new ids; old links to dropped items
  fail gracefully (unknown ids skipped). `"Dave's Single"` stays (2 tests use it).
- **Categories** reuse the existing vocabulary so the scorer/optimizer need no change: `burgers`,
  `chicken`, `wraps`, `salads`, `sides`, `desserts`, `breakfast`, `drinks`. `breakfast` ∈
  `entree_categories`; Seasoned Potatoes → `sides`, Frosty-ccino → `drinks` (so neither is treated
  as an entree). `item_type` = `food` | `drink`.
- **Shape:** existing list-of-objects with `item_id, name, restaurant:"wendys", category,
  item_type, calories, protein, fat, carbohydrate, sugars, sodium`. Note the JSON key is
  `carbohydrate` (singular). Sodium is a real US mg value — no derivation.

### Remove obsolete UK artifacts
Delete `ingest/derive_wendys_sodium.py` (UK salt→sodium derivation) and the local
`ingest/wendys_core_menu.pdf` (untracked; `*.pdf` is gitignored).

### Backend (confirm, minimal edits)
`api.py` computes `/health` counts dynamically (no hardcode); `IMPUTED_SODIUM_MG` becomes a no-op
once all foods report sodium (leave as a safety net); `ITEMS_BY_ID` keys on `str(item_id)`.
`recommend_items.py` category sets already include all categories used.

### Tests (`ingest/test_api.py`)
Update `test_wendys_food_items_have_real_sodium` docstring (sodium now from US source, not UK
salt). Add a US sanity invariant (e.g. Wendy's has burgers + breakfast + drinks; Dave's Single
calories in a US range to catch a parse/build regression). `/health` sum-check and `test_scoring`
are data-agnostic.

### Frontend (`fast-food-ui/src/App.jsx`)
Add `breakfast` and `desserts` to the Wendy's category dropdown. `CATEGORY_EMOJI` already covers
🥞/🍦/🥤.

## Out of scope
Official-exact sourcing (no clean US source exists); a spicy wrap variant (uncertain data);
chocolate Frosty-ccino (only vanilla fully sourced); seasonal/LTO items.

## Verification
- Run generator; spot-check Dave's Single (590, not 524), Baconator, a Frosty, a soda vs a 2nd
  source.
- `cd ingest && python -c "import api" && pytest`.
- `cd fast-food-ui && npm run lint && npm run build`.
- Live after deploy: `/health` Wendy's count; `/recommend?restaurant=wendys` shows US values;
  `/items?ids=Dave's Single` resolves; `restaurant=all` optimizer mixes Wendy's fairly.

## Delivery
Branch `track-b-wendys-us` → spec commit first → generator + JSON + tests/docs + frontend → PR
(CI gates main) → user OK → merge (prod deploy) → verify live.
