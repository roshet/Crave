# Score a Hand-Built Meal — "Why this meal scores" in the Meal Builder — Design

**Date:** 2026-07-07
**Status:** Approved
**Track:** C (new features), feature 13

## Problem

The score explainer (feature 11, shipped 2026-07-06) added a 0–100 health score plus
"Why this score" diverging contribution bars to two surfaces: the **Browse item modal**
and the **Optimize meal cards**. It deliberately left the **Meal Builder** out — a meal
the user assembles by hand there shows macro rings and goal badges, but **no overall
score and no explanation**. So a user can build a meal and has no idea how it scores, or
which nutrient is dragging it down — the exact insight the explainer already gives
everywhere else. The blocker at the time was framed as "no server-computed score exists
for a hand-built meal." This spec removes that blocker by computing one.

## Goal

For the current hand-built meal in the Meal Builder, show a normalized **0–100 score**
plus the same **diverging contribution bars**, scored against the currently-selected
goal — updating live as items are added/removed or the goal changes.

## Non-goals (v1)

- Breakdown on the Meal-Builder `alternativeMeals` rows (they already show a score).
- Scoring meal items whose ids aren't in the backend index — they are skipped, exactly
  as `/items` skips unknown ids (a link/meal survives a since-deleted item).
- Any change to the scoring math, or to the Browse/Optimize explainers (all shipped).
- Client-side (JS) scoring — see the design principle below.

## Design principle: backend owns the math (no drift)

The frontend does not know `GOAL_PROFILES` weights or `saturate()`. Project history
includes a bug where a hardcoded frontend score table (`SCORE_RANGES`, since deleted)
silently drifted from the backend weights. So the score and breakdown for a hand-built
meal are computed by the **same Python functions** the Optimize path already uses
(`health_score`, `meal_breakdown`, `score_bounds`) and merely rendered by the frontend.

**Consistency win:** because a meal's `total_score` is the sum of its items'
`health_score`s and its breakdown is the element-wise sum of their terms — identical to
`build_optimal_meal` (`recommend_items.py`) — a meal sent from Optimize to the Meal
Builder shows the *same* score it showed on the Optimize card (same goal + max_calories).

## Backend — new `GET /score_meal` (`ingest/api.py`)

Mirror the existing `GET /items` endpoint for id parsing + lookup, then score with the
existing engine. No new scoring code — just imports and a route.

- Add `health_score` and `meal_breakdown` to the `from recommend_items import ...` line
  (`score_bounds` is already imported).
- New route:

```python
@app.get("/score_meal")
def score_meal(
    ids: str = Query(..., description="Comma-separated item_ids that make up the meal"),
    goal: str = Query("balanced", pattern="^(balanced|high_protein|low_sugar|low_fat)$"),
    max_calories: int = Query(600, ge=1),
):
    requested = [part.strip() for part in ids.split(",") if part.strip()]
    if not requested:
        raise HTTPException(status_code=400, detail="Query param 'ids' must not be empty.")
    matched = [ITEMS_BY_ID[i] for i in requested if i in ITEMS_BY_ID]  # unknown ids skipped
    total = round(sum(health_score(it, goal, max_calories) for it in matched), 3)
    return {
        "total_score": total,
        "item_count": len(matched),
        "breakdown": meal_breakdown(matched, goal, max_calories),
        "score_bounds": score_bounds(goal),
    }
```

Behavior mirrors `/items`: keys are opaque strings (`str(item_id)`), unknown ids
silently skipped, empty `ids` → 400, bad `goal` → 422 (pattern), missing `ids` → 422.
All-unknown ids → `item_count: 0`, `breakdown: []`, `total_score: 0` (the frontend
guards on `item_count > 0`, so nothing misleading renders).

Why GET (not POST): the Render backend is entirely GET and `/items` already passes a
meal's ids as a comma-separated query param — this stays consistent and avoids touching
the CORS `allow_methods=["GET"]` list.

## Frontend (`fast-food-ui/src/App.jsx` + `App.css`)

Reuse `ScoreBreakdown` and `normalizeScore` — no new component.

- **State:** `const [mealScore, setMealScore] = useState(null)` near the other meal
  state. Holds `{ total_score, item_count, breakdown, score_bounds }` or `null`.
- **Fetch effect:** a `useEffect` keyed on `[meal, goal, maxCalories]`. When
  `meal.length > 0`, fetch
  `${API_BASE_URL}/score_meal?ids=<ids>&goal=<goal>&max_calories=<maxCalories>` and store
  the result; when the meal is empty, set `mealScore` to `null`. Build `ids` with the
  same collection `shareMeal` uses:
  `meal.map((m) => encodeURIComponent(getItemKey(m))).join(",")`. Wrap in try/catch — on
  any failure set `mealScore` to `null` so the section just hides (offline/local-dev
  safe, mirroring the share-link fallback philosophy).
- **Render:** inside the `meal.length > 0` branch of the meal tab, after the `mealList`
  and before the `actionRow`, gated on `mealScore && mealScore.item_count > 0`:
  - a prominent score line —
    `normalizeScore(mealScore.total_score, mealScore.score_bounds, mealScore.item_count)/100`.
  - `<ScoreBreakdown breakdown={mealScore.breakdown} title="Why this meal scores…" />`
    (identical title string to the Optimize cards).
- **Goal used:** the shared `goal` filter state — the same value `getGoalBadges()`
  already reacts to, so the score, goal badges, and breakdown all agree. No goal selector
  is added to the Meal tab (matches current behavior).

### CSS

`.scoreBreakdown` and its children (incl. dark-mode overrides) are self-contained and
reused verbatim — no new breakdown CSS. For the score line, reuse the existing
`.optimizeScore` badge class if it drops in cleanly; otherwise add a small
`.mealScoreBadge` (+ dark override).

## Tests (`ingest/test_api.py`)

Mirror the existing `/items` + breakdown tests (TestClient):

1. `/score_meal` with a known multi-id meal returns `item_count`, `total_score`, and a
   `breakdown` whose `points` sum to `total_score` (`pytest.approx(..., abs=0.05)` — meal
   level compounds per-term display rounding, same tolerance the meal-breakdown tests use).
2. `total_score` equals the sum of the items' individual `health_score`s.
3. mixed ids incl. a Wendy's string-id (e.g. `Dave's Single`) resolve.
4. unknown id skipped (`item_count` reflects only matched); empty `ids` → 400.
5. bad `goal` → 422.

## Verification

1. `cd ingest && python -c "import api"` then `pytest` (new tests green; total climbs
   from 67).
2. `cd fast-food-ui && npm run lint && npm run build`.
3. Local smoke: uvicorn + `npm run dev`; add 2–3 Browse items to the meal, open Meal
   Builder, confirm the score + "Why this meal scores…" bars appear and update on
   add/remove and goal change. Curl `/score_meal?ids=200692,Dave's Single&goal=high_protein`
   and confirm `total_score` matches summing the two items' `/recommend` scores.
4. Cross-check: send an Optimize meal to the Meal Builder; the Meal Builder score matches
   the Optimize card's score (same goal/max_calories).

## Rollout

Feature branch `track-c-score-hand-built-meal` → spec commit → impl commit → CI green →
user OK → merge to main (prod deploy) → verify live on Render (`/score_meal`) + the Vercel
bundle.
