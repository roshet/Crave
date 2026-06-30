# Entree-less optimizer meals + honest thin-options messaging

**Date:** 2026-06-30
**Status:** Approved (design)
**Type:** Cross-cutting (backend + frontend)

## Problem

Wendy's US has **no vegan entree**. Its vegan set is 4 sides (Small/Medium/Large Fries, Plain Baked Potato) + 8 drinks — **0 entrees**. This is *correct* data, not a gap: Wendy's does not sell a vegan/plant-based entree in the US, so there is nothing real to add.

The meal optimizer (`build_optimal_meal` in `recommend_items.py`) hard-requires an entree:

```python
if not entrees:
    return None
```

So `optimize_meal?vegan=true` for Wendy's **always** returns `"No valid meal found under constraints."` The frontend's generic failure hint ("raise the calorie cap, switch the goal, or pick a different restaurant") misleads the user, because nothing they do at Wendy's will ever produce a vegan meal.

Same shape applies to any restaurant/filter combination where a diet filter removes every entree.

## Goal

When no entree qualifies but a side does, the optimizer should assemble an honest **sides-only meal** (e.g. Plain Baked Potato + Water) instead of failing, and the UI should label it truthfully. No invented data.

Decided in brainstorming:
- Fallback triggers **whenever no entree qualifies** (general rule — not gated to diet filters).
- Sides-only meal shape: **one side + optional drink** (no second side, no drink-only meals).
- Honest label on such meals; diet-aware failure hint when a meal genuinely can't be built.

## Design

### 1. Backend — `recommend_items.py` / `build_optimal_meal`

Replace the early `if not entrees: return None` with an anchor-selection fallback:

- If `entrees` is non-empty: anchor pool = `entrees`, side slot = `sides` (current behavior), `entree_less = False`.
- Else if `sides` is non-empty: anchor pool = `sides`, side slot forced to `[None]` (no second side), `entree_less = True`.
- Else (no entrees and no sides — e.g. drinks only): `return None`.

The existing triple loop, calorie cap, and `GOAL_CONSTRAINTS` checks apply unchanged. `high_protein`'s 35g floor naturally yields no sides-only meal — the honest answer (sides can't reach 35g protein).

Add `"entree_less": entree_less` to each dict appended to `ranked_results`.

Drink-only meals stay excluded: the anchor is always a side (or entree), never a drink.

### 2. Backend — `api.py` / `/optimize_meal`

The human-format response rebuilds each meal dict explicitly, so add the flag there:

```python
"entree_less": m.get("entree_less", False),
```

Raw format passes through via `**meal`. No new query params. The per-restaurant aggregation path (`restaurant=all`) carries the flag automatically since it extends `result["meals"]`.

### 3. Frontend — `App.jsx`

- On each optimize result card where `entree_less` is true, render a small honest line, e.g.
  **"🥬 Sides-only meal — no vegan entree at this restaurant"**
  - Diet word ("vegan" / "vegetarian") derived from the active `diet` state; when `diet === "none"`, wording drops the diet word ("Sides-only meal — no entree fit your filters").
  - When `restaurant === "all"`, use restaurant-neutral wording ("…no entree available").
- Make the optimize-failure hint diet-aware: when `optimize_meal` still returns the no-meal message **with a diet filter active** (realistically `high_protein` + vegan/vegetarian), show a specific message — e.g. "No vegan meal reaches High Protein's 35g target here. Try another goal or restaurant." — instead of the generic calorie-cap hint.
- Browse empty-state already has a diet-aware message (App.jsx ~line 742) — leave unchanged.

### 4. Tests — `test_api.py` (+ unit coverage)

- Wendy's `optimize_meal?vegan=true&goal=low_fat` returns ≥1 meal; every item has `vegan: true`; no item is in an entree category; `entree_less` is true.
- Wendy's `vegan` + `high_protein` still returns the no-meal message (honest impossibility).
- Regression: a normal restaurant with no diet filter still returns entree-anchored meals with `entree_less` false — non-diet behavior unchanged.

## Scope boundaries (YAGNI)

- No Wendy's (or any) menu data invented or added.
- No second side in entree-less meals; no drink-only meals.
- Browse copy untouched.
- No new endpoints or query params.

## Validation

- `cd ingest && python -c "import api"` and `pytest`
- `cd fast-food-ui && npm run lint && npm run build`
- Live smoke: `optimize_meal?restaurant=wendys&vegan=true&goal=low_fat` returns a sides-only meal; `&goal=high_protein` returns the no-meal message.
