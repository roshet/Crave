# Score Explainer — "Why this score" — Design

**Date:** 2026-07-06
**Status:** Approved
**Track:** C (new features), feature 11

## Problem

Every Crave item and optimized meal shows a 0–100 health score, but the number is
opaque. A user sees `81/100` with no way to tell whether protein carried it or sodium
dragged it down. The backend already computes each nutrient's weighted contribution
inside `health_score()` (`ingest/recommend_items.py`) — protein raises the score;
sugar, fat, carb, sodium, and calorie penalties lower it — but discards those pieces,
shipping only the final number and a qualitative `reason` string (rendered as the
"✓ …" summary badge).

## Goal

Surface the per-nutrient contributions and render them as **diverging contribution
bars**: green bars (growing right) for nutrients that raised the score, red bars
(growing left) for nutrients that lowered it, bar length proportional to weighted
impact. Show them in:

1. The **Browse item detail modal** (per-item breakdown).
2. The **Optimize meal cards** (meal-total breakdown; a meal's score is the sum of its
   items' scores, so its breakdown is the element-wise sum of their contributions).

## Non-goals (v1)

- Breakdown on the Meal-Builder `alternativeMeals` rows.
- Breakdown for the user's hand-built meal (no server-computed score exists for it).
- Any change to the scoring math itself — this is presentation of existing math.
- Showing the raw weighted point values to users (abstract fractions). We show the
  real gram/mg value plus a bar; points drive only bar length and sign.

## Design principle: backend owns the math (no drift)

The frontend does not know `GOAL_PROFILES` weights or `saturate()`. Project history
includes a bug where a hardcoded frontend score table (`SCORE_RANGES`, since deleted)
silently drifted from the backend weights. Therefore the backend computes the
breakdown and the frontend only renders it. A regression test asserts that a
breakdown's `points` sum to `health_score`, so the two can never diverge.

## Backend

### `ingest/recommend_items.py`

Extract the six weighted terms currently inline in `health_score()` into one helper so
the score and its explanation share a single source of truth:

```python
def _score_terms(item, goal, max_calories=600):
    """Ordered per-nutrient terms. Sum of points == health_score.
    Returns [{"key","label","value","unit","points"}, ...] with
    protein points >= 0 (raises the score) and the five penalty
    terms <= 0 (lower it)."""
```

- `health_score()` becomes `round(sum(t["points"] for t in _score_terms(...)), 3)` —
  identical output, now derived from the same terms the breakdown exposes.
- `score_breakdown(item, goal, max_calories=600)` returns `_score_terms(...)` with each
  `points` rounded to 3 dp. `value` is the real gram/mg number (sodium imputed exactly
  as `health_score` does via `IMPUTED_SODIUM_MG`); `unit` is `"g"`, `"mg"`, or `""`.
- `meal_breakdown(meal_items, goal, max_calories)` returns the element-wise sum of
  `_score_terms` across the meal's items (`value` and `points` summed per nutrient),
  same order/shape.

Wire it into responses:

- In `get_recommendations()`, next to where `reason` is set, add
  `item_copy["breakdown"] = score_breakdown(item, goal, max_calories)`.
- In `humanize_items()`, add `"breakdown": item.get("breakdown")` to the emitted dict.
  Items fetched via `/items` (shared-meal rehydration) have no breakdown set, so the
  field is `None` there; the modal renders the section only when it is present.
- In `build_optimal_meal()`, add
  `"breakdown": meal_breakdown(meal_items, goal, max_calories)` to each result dict.

### `ingest/api.py`

In the `/optimize_meal` human-format block, add `"breakdown": m.get("breakdown")` to
each emitted meal dict. `/recommend` and `/items` need no change (they return
`humanize_items()` output, which now carries `breakdown`). Raw format already passes
the field through via spread.

## Frontend (`fast-food-ui/src/App.jsx` + `App.css`)

New module-level presentational helper:

```jsx
function ScoreBreakdown({ breakdown, title })
```

- `maxMag = Math.max(...breakdown.map(t => Math.abs(t.points)))`, guarded so `0` →
  all-neutral (no divide-by-zero).
- One row per term: left column = label + `value + unit`; right column = a diverging
  bar inside a track with a center axis. `points > 0` → green bar growing rightward;
  `points < 0` → red bar growing leftward; `|points|` below a small epsilon → a neutral
  dot. Bar length = `50% * |points| / maxMag`.
- Header (default "Why this score?") + legend ("Green raises · Red lowers").
- Reads only `breakdown`; reused for both items and meals.

Placement:

- **Item modal**: after the summary badge, render
  `{modalItem.breakdown && <ScoreBreakdown breakdown={modalItem.breakdown} />}`.
- **Optimize meal cards**: under each card's `Score …/100`, render
  `<ScoreBreakdown breakdown={result.breakdown} title="Why this meal scores…" />`.

CSS classes (with `:root[data-theme="dark"]` overrides matching the existing
design system): `.scoreBreakdown`, `.breakdownHead`, `.breakdownRow`,
`.breakdownLabel`, `.breakdownValue`, `.breakdownBarTrack` (center axis = 1px line at
50%), `.breakdownBar`, `.breakdownBar--up` (green), `.breakdownBar--down` (red),
`.breakdownNeutral`, `.breakdownLegend`.

## Tests

`ingest/test_scoring.py`:

- **Drift guard**: for every real item and all four goals, the sum of
  `score_breakdown(...)` points ≈ `health_score(...)`.
- Protein term `points >= 0`; each of the five penalty terms `points <= 0`.
- `meal_breakdown` points sum ≈ a built meal's `total_score`.

`ingest/test_api.py`:

- `/recommend?format=human` items carry `breakdown` — a 6-element list with
  `key`/`value`/`points`.
- `/optimize_meal` meals carry `breakdown`.

## Verification

1. `cd ingest && python -c "import api"` then `pytest`.
2. Local curl: `/recommend?...&format=human` breakdown points sum to the item's raw
   score; `/optimize_meal?...` meals carry `breakdown`.
3. `cd fast-food-ui && npm run lint && npm run build`.
4. Browser (if Chrome extension connected): item modal bars read sensibly (protein
   green/right, penalties red/left, biggest driver longest); meal cards show a
   breakdown; light and dark themes both correct.

## Rollout

Feature branch `track-c-score-explainer` → spec commit → impl commit → CI green →
user OK → merge to main (prod deploy) → verify live on Render + the Vercel bundle.
