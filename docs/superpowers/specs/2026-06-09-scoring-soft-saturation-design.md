# Scoring: soft-saturation + fairness fixes — Design

**Date:** 2026-06-09
**Status:** Approved

## Problem

The health-scoring engine (`ingest/recommend_items.py`) is a weighted-linear model:
`protein_score - sugar - fat - carb - sodium - calorie` penalties, each term
`clamp(value, cap) = min(value/cap, 1.0)` scaled by a per-goal weight. It is sound and
worth keeping, but has three concrete defects:

1. **Missing-sodium free pass (fairness bug).** Wendy's items carry no sodium data;
   `None` is treated as `0`, i.e. *no penalty*. A salty Wendy's item therefore outscores
   an identical McDonald's item that honestly reports sodium. The model rewards missing
   data. (`recommend_items.py:55-56, 64`)
2. **Saturation kills discrimination at the tail.** Because each term clamps to `1.0`, a
   40g-fat and an 80g-fat item receive the *identical* fat penalty, and protein credit
   stops at 30g. The score goes blind exactly where the best and worst items live.
3. **Frontend/backend normalization coupling.** `fast-food-ui/src/App.jsx` `SCORE_RANGES`
   hand-mirrors the backend's per-goal min/max to map raw scores → 0–100%. Changing a
   backend weight silently corrupts the displayed percentages, with no test to catch it.

**Chosen direction:** "balance, bounded" — preserve the philosophy that no single
nutrient dominates, but stop the score from saturating. Explicitly *not* doing:
protein-density terms, interaction effects, full redesign, or new nutrient data
(fiber / saturated fat are not in the datasets).

## Design

### 1. Soft saturation

Replace the hard `clamp` with `saturate`, identical within `[0, cap]` (so in-range
rankings are unchanged) and adding a bounded extra term past the cap:

```python
TAIL_WEIGHT = 0.5  # max extra a single term can contribute beyond its cap

def saturate(value, cap):
    if cap == 0:
        return 0.0
    base = min(value / cap, 1.0)                              # unchanged in-range
    overflow = max(value - cap, 0.0)
    extra = TAIL_WEIGHT * (1.0 - math.exp(-overflow / cap))   # 0 at cap → TAIL_WEIGHT
    return base + extra                                       # bounded by 1 + TAIL_WEIGHT
```

The five `clamp(...)` calls in `health_score()` become `saturate(...)`. Each term is now
bounded by `(1 + TAIL_WEIGHT) * weight`. Hard `GOAL_CONSTRAINTS` (raw-gram min/max) are
untouched — they operate on raw totals, not scores.

### 2. Sodium imputation

When sodium is missing, impute a representative value instead of `0`, so missing-data
items carry a fair penalty and gain no cross-restaurant advantage:

- `IMPUTED_SODIUM_MG = 600.0` module constant in `recommend_items.py` (default).
- `health_score()` and `explain_item()` use it when `sodium is None`. `explain_item`
  keeps the honest `"sodium data unavailable"` reason string.
- `api.py` computes, at startup, the median sodium of **food** items that report it
  (drinks/sauces excluded — they skew near zero, and all missing-sodium items happen to
  be foods) and assigns it to `recommend_items.IMPUTED_SODIUM_MG`, so the value tracks
  the data (no magic number). In the current dataset this is ~660 mg vs ~195 mg if drinks
  were included.

This shifts every Wendy's item by the same amount → Wendy's *internal* ordering is
unchanged; only the unfair cross-chain boost is removed.

### 3. Backend-owned normalization

The backend becomes the single source of truth for the 0–100 mapping.

- `score_bounds(goal)` in `recommend_items.py` returns analytic per-item bounds:
  - `max = (1 + TAIL_WEIGHT) * w["protein"]`
  - `min = -(1 + TAIL_WEIGHT) * (w["sugars"]+w["fat"]+w["carbs"]+w["sodium"]+w["calories"])`
- `/recommend` and `/optimize_meal` include `"score_bounds": {"min", "max"}` for the goal
  used.
- `App.jsx`: delete `SCORE_RANGES`; store the returned bounds in a `scoreBounds` state and
  have `normalizeScore(rawScore, bounds, itemCount)` read them. The existing `itemCount`
  scaling (for multi-item meals) is unchanged — it multiplies the per-item bounds.

Resulting bounds (old SCORE_RANGES × 1.5, confirming consistency):
`balanced ±[-7.2, 1.8]`, `high_protein [-6.0, 3.0]`, `low_sugar/low_fat [-8.1, 1.5]`.

## Files

- `ingest/recommend_items.py` — `import math`; `saturate()`, `TAIL_WEIGHT`,
  `IMPUTED_SODIUM_MG`, `score_bounds()`; swap clamps; impute sodium in two functions.
- `ingest/api.py` — median-sodium computation at startup; `score_bounds` in two responses.
- `fast-food-ui/src/App.jsx` — remove `SCORE_RANGES`; `scoreBounds` state; rework
  `normalizeScore` + its four call sites.

## Verification

1. `cd ingest && python -c "import api"`.
2. `saturate` equals old `min(v/cap,1)` below cap, strictly greater above; an 80g-fat item
   now scores below a 40g-fat item under the same goal (was equal).
3. A `sodium=None` item and one with `sodium=IMPUTED_SODIUM_MG` score identically.
4. `score_bounds("balanced") ≈ {min:-7.2, max:1.8}`; every real item's raw score falls in
   `[min, max]`.
5. `cd fast-food-ui && npm run lint && npm run build`.
6. End-to-end: backend + `npm run dev`; scores still render 0–100; high-sodium Wendy's
   items no longer rank suspiciously above peers.
