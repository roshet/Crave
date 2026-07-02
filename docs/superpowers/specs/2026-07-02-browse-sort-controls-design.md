# Browse Sort Controls — Design

**Date:** 2026-07-02
**Status:** Approved
**Scope:** Backend (`ingest/api.py`, `ingest/recommend_items.py`) + frontend
(`fast-food-ui/src/App.jsx`, `App.css`). Cross-cutting → spec-first per CLAUDE.md.

## Problem

Browse always returns the top items **by health score** for the current filters, with no
way to reorder. A user who wants "lowest-calorie" or "highest-protein" options can't get
there — which pairs poorly with the macro filters (you can filter `max_sugar<=5` but not
then rank those by protein).

## Solution

A sort dropdown on Browse with six options: **Best score (default), Fewest calories, Most
protein, Least sugar, Least fat, Least sodium.**

## Decisions

- **Server-side sort.** `/recommend` returns only the top 20 *by score*; re-sorting those
  20 client-side would not surface the actually-lowest-cal / highest-protein items (they may
  never make the top-20-by-score cut). So the sort happens in `get_recommendations()` **before**
  the `top_n` slice. All existing filters (goal, diet, macro, calorie) run first, unchanged.
- **Direction baked into each option** (score/protein desc = higher is better; calories/
  sugar/fat/sodium asc = lower is better) → a single dropdown, no separate asc/desc toggle.
- **Backend param:** `sort: str = Query("score", pattern="^(score|calories|protein|sugars|fat|sodium)$")`.
  Invalid → 422 via the pattern, matching the existing param style.
- **Frontend:** `sort` is **Browse-scoped state** (not part of the shared FilterChips state —
  Optimize doesn't list items). Dropdown sits after the search bar; Browse re-queries on change.

## Reused building blocks

- `get_recommendations()` final sort line (`recommend_items.py`) — one branch added.
- `.chipSelect` styling for the dropdown; `fetchBrowse` URL builder + its auto-fetch dep array.
- Existing `/recommend` `Query(pattern=…)` → 422 validation idiom.

## Out of scope (YAGNI)

Separate asc/desc toggle, sort on Optimize, sort by carbs, persisting the sort to
localStorage, secondary/tie-break keys.

## Verification

- Backend `pytest` (54 + ~5 new): `sort=calories` ascending, `sort=protein` descending,
  `sort=sugars` ascending, default score-desc preserved, `sort=bogus` → 422.
- Frontend `npm run lint && npm run build` clean.
- Live smoke: `GET /recommend?sort=calories` calories ascending; `sort=bogus` → 422.
