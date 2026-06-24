# Vegetarian Filter — Design

**Date:** 2026-06-24
**Status:** Approved (design), pending spec review
**Track:** C (new features) — dietary filters, scoped to vegetarian only

## Problem

The app has no way to filter by diet. The most-requested dietary cut for a food
app is vegetarian. None of the 5 datasets carry ingredient, allergen, or diet
data — items have only `name`, `category`, `item_type`, and macros. So a
vegetarian tag must be *derived* from name + category, with manual correction
for what heuristics miss.

Scope is deliberately **vegetarian only**. Vegan, gluten-free, and allergen
filters are explicitly out of scope:
- Vegan/GF have too many name-invisible cases (cheese, egg, mayo, breading).
- Allergen filters are a safety risk to derive from names and are excluded.

## Goals

- A boolean `vegetarian` field on every item across all 5 datasets.
- A "🌱 Vegetarian only" filter that applies to **both** Browse and Optimize.
- A 🌱 badge so users can see which items are vegetarian without filtering.
- Backwards-compatible: default behavior unchanged when the filter is off.

## Non-Goals

- Vegan, gluten-free, allergen, or any other dietary filter.
- Real ingredient/allergen data sourcing.
- Certified-claims accuracy. Tags are best-effort derivations, not guarantees.

## Design

### 1. Data layer — `ingest/tag_vegetarian.py`

A new idempotent generator script (mirrors `build_wendys_us.py` /
`build_burgerking_us.py`) that reads all 5 JSON files and writes a boolean
`vegetarian` field onto every item. Two layers:

1. **Heuristic classifier** — a non-vegetarian keyword set matched
   case-insensitively against the item `name` (e.g. `bacon`, `chicken`, `beef`,
   `sausage`, `fish`, `nugget`, `pepperoni`, `steak`, `ham`, `bbq` brisket
   terms, `mcrib`, `filet`, `mcchicken`, etc.), plus category signals. Drinks,
   desserts/sweets, and most sides default to vegetarian.
2. **Explicit override dict** (`item_id → bool`) — the auditable escape hatch
   for whatever the heuristic gets wrong, same role as the per-item tables in
   the other generators.

**Conservative bias:** mark `vegetarian: true` *only when confident*; ambiguity
defaults to `false`. A veg item wrongly hidden is a mild annoyance; a meat item
wrongly shown to someone filtering vegetarian is a real failure. The safe error
direction is to under-include.

**Structural gotcha:** the datasets are NOT uniform.
- `chickfila_items.json` is a **dict keyed by `item_id`** (value = item dict).
- The other 4 (`mcdonalds`, `wendys`, `tacobell`, `burgerking`) are **lists**.
- Chick-fil-A uses field `carbs`; the others use `carbohydrate`.
The script must detect list-vs-dict, iterate accordingly, write `vegetarian`
into each item object, and preserve all existing fields/structure exactly.
Re-running must be a no-op diff (idempotent).

**Workflow:** run the heuristic, review the output, then bring the borderline /
non-obvious calls (cheese-containing items, fish, "garden"/composed salads) to
the user for a quick data-table review before finalizing the override dict.

### 2. Backend — `ingest/api.py`

A `vegetarian: bool = False` query param on two endpoints:

- **`GET /recommend?vegetarian=true`** — filter the candidate item list to
  `vegetarian == true` before scoring/sorting.
- **`GET /optimize_meal?vegetarian=true`** — restrict the entree/side/drink
  candidate pools to vegetarian items before brute-forcing combinations, so
  every returned meal is fully vegetarian. Degrades gracefully when a restaurant
  has no veg option in a slot (same as existing category-missing behavior).

Filtering is backend-side (not frontend) because the optimizer must filter
*before* combining; doing Browse the same way keeps one source of truth.
Default `false` preserves current behavior — fully backwards-compatible. The
`/items` lookup endpoint (share links) is untouched.

### 3. Frontend — `fast-food-ui/src/App.jsx` + `App.css`

- **"🌱 Vegetarian only" toggle** in the shared filter row (alongside goal /
  restaurant / max calories / category). Lives in shared filter state so it
  applies to both Browse and Optimize automatically, passing `vegetarian=true`
  to both endpoints. Keyboard-accessible with an `aria-label`, matching the
  Track A a11y baseline.
- **🌱 badge** on vegetarian item rows and in the detail modal, shown always
  (not only when filtering), so veg items are spottable during normal browsing.
- The existing "Showing X of Y items" count line reflects the filtered set.

## Testing

Add to `ingest/test_api.py`:
- Known meat items (e.g. Big Mac, 10 Pc McNuggets, Baconator) are **absent**
  when `vegetarian=true`.
- Known vegetarian items (e.g. fries, a plain side salad, a soda) are
  **present** when `vegetarian=true`.
- `/optimize_meal?vegetarian=true` returns a meal whose every item is
  `vegetarian == true`.
- A data invariant: every item in every dataset has a boolean `vegetarian`
  field (guards against a dataset edit dropping the tag).

Validation per CLAUDE.md: backend `python -c "import api"` + `pytest`;
frontend `npm run lint && npm run build`.

## Rollout

Single PR (Track C feature 5). Generator script + JSON field changes + backend
param + frontend toggle/badge + tests. CI gates main; merge to main triggers
prod deploy (Vercel + Render), so merge requires explicit user authorization
per the established prod-deploy gate. Verify live afterward:
Render `/recommend?vegetarian=true` excludes meat; Vercel bundle contains the
toggle.
