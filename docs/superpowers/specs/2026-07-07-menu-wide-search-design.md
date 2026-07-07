# Menu-Wide Item Search — Design

**Date:** 2026-07-07
**Status:** Approved
**Track:** C (new features), feature 14

## Problem

The Browse "search" box (`fast-food-ui/src/App.jsx`, the `displayedResults` memo) only
does a **client-side substring filter over the ~20 items `/recommend` already returned**.
So a user who types "baconator", "mcflurry", or "coke" finds nothing unless that item is
already in the current top-20-by-score for the active filters. There is no way to actually
find a specific menu item — a glaring gap for a fast-food nutrition app.

## Goal

A **real name search across the whole menu**: a new `GET /search` endpoint that matches
items by name substring, scores/ranks them by the selected goal, and returns them in the
same humanized shape Browse already renders. The Browse search box is wired to it.

## Key semantic decision: search finds items, it does not "recommend"

`/recommend` applies heuristics that intentionally *hide* items: the `max_calories` cap,
the `balanced` goal's drink-drop, and the `balanced` 8g-protein floor. Search must NOT
apply those — otherwise searching "Baconator" (960 cal, over the 600 cap) or "Coca-Cola"
(a drink, dropped under balanced) would return nothing, which is exactly the failure a
search is meant to fix. Search DOES honor the user's explicit **restaurant** and **diet**
(vegetarian/vegan) choices, and scores by the selected **goal** so results still rank by
fit. Sauces are excluded (as everywhere else). Category / macro / sort / calorie chips are
NOT applied during an active search (search overrides them by design).

## Backend — new `GET /search` (`ingest/api.py`)

Reuse the existing engine end-to-end — no new scoring code.

- Imports: add `explain_item`, `score_breakdown` to the `from recommend_items import ...`
  line (`health_score`, `score_bounds`, `humanize_items` already imported).
- Route:
  ```python
  @app.get("/search")
  def search(
      q: str = Query(..., min_length=1, description="Item name substring"),
      restaurant: str = Query("all", pattern="^(mcdonalds|chickfila|wendys|tacobell|burgerking|all)$"),
      goal: str = Query("balanced", pattern="^(balanced|high_protein|low_sugar|low_fat)$"),
      top_n: int = Query(30, ge=1, le=50),
      vegetarian: bool = Query(False),
      vegan: bool = Query(False),
  ):
      q_norm = q.strip().lower()
      if not q_norm:
          raise HTTPException(status_code=400, detail="Query param 'q' must not be blank.")
      items = <same per-restaurant selection block used by /recommend>
      if vegetarian: items = [it for it in items if it.get("vegetarian")]
      if vegan:      items = [it for it in items if it.get("vegan")]
      matches = [
          it for it in items
          if it.get("item_type") != "sauce" and q_norm in (it.get("name") or "").lower()
      ]
      scored = []
      for it in matches:
          c = it.copy()
          c["health_score"] = health_score(it, goal)     # default max_calories=600
          c["reason"]       = explain_item(it, goal)
          c["breakdown"]    = score_breakdown(it, goal)
          scored.append(c)
      scored.sort(key=lambda x: x["health_score"], reverse=True)
      return {
          "query": q,
          "results": humanize_items(scored[:top_n]),
          "score_bounds": score_bounds(goal),
      }
  ```
- `q` required + `min_length=1` → missing/empty → 422; whitespace-only → 400. Ranked by
  `health_score` desc, sliced `top_n` (default 30, max 50). Same `{results, score_bounds}`
  shape Browse consumes; `humanize_items` carries `score`/`breakdown` (attached on the copy
  exactly like `get_recommendations`), so `normalizeScore` works unchanged. The
  per-restaurant selection block is duplicated from `/recommend` — mirror the existing
  inline pattern (already repeated in the codebase; factoring a helper is out of scope).

## Frontend — wire the Browse search box (`fast-food-ui/src/App.jsx`)

Turn the client-side filter into a debounced server search; empty search = today's Browse.

- **Debounce:** `debouncedSearch` state + a 300ms `setTimeout` effect keyed on `search`.
- **Endpoint choice in `fetchBrowse`:** if `debouncedSearch.trim()`, hit
  `/search?q=&restaurant=&goal=` (+ `&vegetarian=true`/`&vegan=true` from `diet`); else the
  current `/recommend?...` URL. Both set `results` + `score_bounds`.
- **Auto-fetch dep array:** add `debouncedSearch` so typing refetches.
- **Drop the client filter:** `displayedResults` becomes just `results`.
- **Copy:** placeholder `"Filter these results…"` → `"Search all menu items…"`; count line
  reads `Showing N results for "<query>"` when searching. Empty state gets a search branch
  (`No menu items match "<query>".`) before the diet/macro/generic branches.

No new CSS.

## Tests (`ingest/test_api.py`)

1. `/search?q=baconator` non-empty; every title contains "baconator"; each carries `score`
   + 6-term `breakdown`; response has `score_bounds`.
2. Bypasses the cal cap: `/search?q=Baconator` returns the 960-cal Baconator.
3. Bypasses the balanced drink-drop: `/search?q=coca&goal=balanced` returns Coca-Cola.
4. Restaurant scoping: `/search?q=fries&restaurant=mcdonalds` → all mcdonalds.
5. Ranked by score: result `score`s non-increasing.
6. Diet honored: `vegetarian=true` → all results vegetarian.
7. Missing `q` → 422; whitespace-only → 400.

## Verification

1. `cd ingest && python -c "import api"` then `pytest`.
2. `cd fast-food-ui && npm run lint && npm run build`.
3. Local smoke: uvicorn + `npm run dev`; search "baconator" (appears despite over-cap),
   clear (recommendations return), "coca" under Balanced (drinks appear), McDonald's +
   "fries" (only McDonald's). Curl `/search?q=baconator` and `/search?q=coca&goal=balanced`.

## Out of scope (v1)

- Category / macro / sort / calorie filters during an active search.
- Fuzzy/typo-tolerant matching or match-position relevance ranking.
- Search on any tab other than Browse.

## Rollout

Feature branch `track-c-menu-search` → spec commit → impl commit → CI green → user OK →
merge to main (prod deploy) → verify live on Render + the Vercel bundle.
