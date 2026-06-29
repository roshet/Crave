# Vegan Filter — Design

**Date:** 2026-06-26
**Status:** Approved (design), pending spec review
**Track:** C (new features) — dietary filters, feature 6: vegan

## Problem

The app ships a vegetarian filter (Track C feature 5) but no vegan option.
Vegan is the natural next dietary cut, and the entire machinery already exists:
a generator that derives a diet boolean into the JSON, a `Query` param on both
endpoints, and a toggle + badge in the UI. None of the 5 datasets carry
ingredient or allergen data — items have only `name`, `category`, `item_type`,
and macros — so vegan status, like vegetarian, must be *derived* from name +
category with manual correction for what heuristics miss.

Vegan is a strict subset of vegetarian: an item is vegan only if it is
vegetarian **and** contains no egg, dairy (milk/cheese/cream/butter/yogurt), or
honey. It is harder to derive than vegetarian because dairy and egg are often
name-invisible (buns, batters, "natural flavors"), so the conservative bias
matters even more.

## Goals

- A boolean `vegan` field on every item across all 5 datasets, with the hard
  invariant that no item is `vegan` without also being `vegetarian`.
- A mutually-exclusive **Diet** filter (Any / Vegetarian / Vegan) replacing
  today's single vegetarian checkbox, applying to **both** Browse and Optimize.
- A diet badge showing the *strictest* applicable diet per item (🥬 vegan,
  🌱 vegetarian-but-not-vegan) without redundancy.
- Backwards-compatible: the existing `vegetarian=true` param and all current
  behavior are unchanged; default (Any) behaves exactly as today.

## Non-Goals

- Gluten-free, allergen, or any other dietary filter.
- Real ingredient/allergen data sourcing.
- Certified-claims accuracy. Tags are best-effort derivations, not guarantees.
- Re-tagging or changing any existing `vegetarian` value.

## Design

### 1. Data layer — rename `tag_vegetarian.py` → `ingest/tag_diet.py`

The generator now derives *both* diet flags, so its name should match what it
does. `git mv ingest/tag_vegetarian.py ingest/tag_diet.py`, keeping all existing
vegetarian logic (`NON_VEG_KEYWORDS`, `VEG_DEFAULT_CATEGORIES`, `OVERRIDES`,
`_is_vegetarian`) untouched. Add a second layer for vegan:

1. **Heuristic classifier** — `NON_VEGAN_KEYWORDS` (lowercased, matched against
   `name`): `cheese`, `milk`, `cream`, `butter`, `egg`, `mayo`, `ranch`,
   `yogurt`, `parfait`, `shake`, `float`, `latte`, `cappuccino`, `mocha`,
   `frosted`, `queso`, `honey`, `custard`, `icedream`, `sundae`, etc. A
   a helper `_has_vegan_signal(item)` handles only the vegan-specific decision:
   `False` if any non-vegan keyword fires; else a vegan category/default check;
   else conservative `False`. It does **not** re-check meat — the vegetarian
   gate lives in the composing rule below.
2. **Explicit override dict** — `VEGAN_OVERRIDES: dict[str, bool]` keyed on
   `str(item_id)`, the auditable escape hatch (same role as `OVERRIDES`).

**Core rule:** for each item, `veg = _is_vegetarian(item)` (existing, includes
its own `OVERRIDES`); then `vegan = VEGAN_OVERRIDES.get(id, veg and
_has_vegan_signal(item))`. The `veg and …` gate enforces the subset invariant
for the heuristic path; the human-review gate must never add a `VEGAN_OVERRIDES`
`true` entry for a non-vegetarian item, and a test asserts the invariant across
the finished data regardless.

**Conservative bias:** mark `vegan: true` *only when confident*; ambiguity
defaults to `false`. Showing a dairy/egg item to someone filtering vegan is the
failure to avoid. Expect a *small* vegan set (fries, apple slices, plain baked
potato, sodas/tea/water/black coffee, some bean items) and many
currently-vegetarian items correctly excluded (milkshakes, mac & cheese, cheese
quesadilla, McCafé lattes, most buns).

**Structural gotcha (unchanged from veg):** `chickfila_items.json` is a **dict
keyed by `item_id`**; the other 4 are **lists**. The script already handles this
via `_iter_items`. Writing `vegan` must preserve all existing fields/structure
and re-running must be a no-op diff (idempotent). The script writes both
`vegetarian` and `vegan` on every item each run.

**Workflow (human-review gate):** run the heuristic, review the candidate vegan
list, then bring the borderline calls to the user for a quick data-table review
before finalizing `VEGAN_OVERRIDES` — the same gate used for the vegetarian
overrides.

### 2. Backend — `ingest/api.py` + `recommend_items.py`

A `vegan: bool = False` query param on the two endpoints, filtering in the exact
spots `vegetarian` filters today:

- **`GET /recommend?vegan=true`** — filter the candidate list to `vegan == true`
  before scoring/sorting.
- **`GET /optimize_meal?vegan=true`** — filter inside the `_optimize()` helper so
  both the all-restaurant loop and single-restaurant paths restrict every slot
  to vegan items; degrades gracefully to the existing no-meal message when a
  restaurant has no vegan option in a slot (e.g. Wendy's likely has no vegan
  entree).

`humanize_items()` (in `recommend_items.py`) emits `vegan` alongside
`vegetarian` (additive, same pattern). The existing `vegetarian` param is
untouched; `vegan` is purely additive, so share/OG links and all current
behavior are unaffected. If both params were ever sent, applying both filters is
harmless (vegan ⊂ vegetarian), but the UI guarantees only one is sent.

### 3. Frontend — `fast-food-ui/src/App.jsx` + `App.css`

- Replace the `vegetarian` boolean state with a `diet` state:
  `"none" | "vegetarian" | "vegan"`.
- Render a **`<select>` "Diet: Any / Vegetarian / Vegan"** in the shared filter
  row, matching the existing goal/restaurant/category dropdowns (consistent
  styling, minimal new CSS). Lives in shared filter state so it applies to both
  Browse and Optimize. Add `diet` to the Browse auto-fetch dependency array.
- Fetch appends `&vegetarian=true` *or* `&vegan=true` based on `diet` (never
  both; Any sends neither).
- **Badge = strictest diet, no redundancy:** vegan items render 🥬, items that
  are vegetarian but not vegan render 🌱, in both item rows and the detail
  modal. A vegan item shows only 🥬. Keyboard/`aria-label` accessible, matching
  the Track A a11y baseline. The "Showing X of Y items" count reflects the
  filtered set.

## Testing

Add to `ingest/test_api.py` (keep all existing vegetarian tests, including the
meat tripwire):

- Every item in every dataset has a boolean `vegan` field.
- **Subset invariant:** every item with `vegan == true` also has
  `vegetarian == true` (across all datasets).
- Known dairy/egg items (e.g. a milkshake, Mac & Cheese, a cheese quesadilla)
  are **absent** when `vegan=true`; known vegan items (e.g. fries, a soda) are
  **present**.
- `/recommend?vegan=true` excludes non-vegan; off-by-default (no param) includes
  non-vegan.
- `/optimize_meal?vegan=true` returns meals whose every item is `vegan == true`.
- **Non-vegan keyword tripwire** (mirrors the meat tripwire): no `vegan`-tagged
  item name contains a dairy/egg term (cheese, milk, cream, egg, etc.).

Validation per CLAUDE.md: backend `python -c "import api"` + `pytest`;
frontend `npm run lint && npm run build`.

## Rollout

Subagent-driven execution (3 TDD tasks: data/generator → backend param →
frontend selector), broad final review on the most capable model, then a single
PR (Track C feature 6). CI gates main; merge to main triggers prod deploy
(Vercel + Render), so merge requires explicit user authorization per the
established prod-deploy gate. Verify live afterward: Render `/recommend?vegan=true`
excludes dairy/egg; Vercel bundle contains the Diet selector.
