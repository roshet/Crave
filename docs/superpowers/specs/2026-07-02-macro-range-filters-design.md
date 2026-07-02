# Macro-Range Filters — Design

**Date:** 2026-07-02
**Status:** Approved
**Scope:** Backend (`ingest/api.py`, `ingest/recommend_items.py`) + frontend
(`fast-food-ui/src/App.jsx`, `App.css`). Cross-cutting → spec-first per CLAUDE.md.

## Problem

Crave filters by restaurant, goal preset, a max-calorie cap, category, and diet — but
not on the individual macros the goals are *about*. A user who wants "at least 30g
protein" or "under 10g sugar" has to eyeball the list.

## Solution

Optional numeric threshold filters — **min protein, max sugar, max fat, max sodium** —
that complement the existing goal presets and calorie cap. Calories is already covered
by the max-calories control; carbs is omitted as low-demand.

## Decisions

- **Both tabs.** Item-level in `/recommend` (Browse), meal-level (summed) in
  `/optimize_meal` (Optimize) — exactly how `max_calories` already behaves. On Optimize
  the filters stack as additional hard constraints alongside `GOAL_CONSTRAINTS`.
- **UI:** a collapsible "⊕ More filters" panel below the filter chips, with number
  inputs (empty = no limit), reusing the Today-tab daily-targets input styling. Shared
  across both tabs (lives in `FilterChips`). The toggle shows an active-count badge when
  collapsed.
- **Backend shape:** additive optional `Query(None, ge=0)` params (`min_protein`,
  `max_sugar`, `max_fat`, `max_sodium`). No cross-field validation needed — each nutrient
  has a single bound. Negatives → 422 via `ge=0`. Mirrors the vegan/vegetarian pattern.

## Reused building blocks

- `get_recommendations()` per-item loop and `build_optimal_meal()` meal-total block
  (`recommend_items.py`) — new hard-skip checks slot in beside the existing
  `max_calories` / `GOAL_CONSTRAINTS` logic.
- Frontend `updateTarget` clamp idiom → `setMacro`; `.targetInputs`/`.targetInput`
  styling for the panel; the `fetchBrowse` / `optimizeMeal` URL builders (a shared
  `macroQuery()` helper appends only the set params).

## Out of scope (YAGNI)

Max-protein / other min bounds, a carbs filter, sliders, per-restaurant macro defaults,
persisting macro filters to localStorage.

## Verification

- Backend: `python -c "import api"` + `pytest` (existing 48 + ~6 new).
- Frontend: `npm run lint && npm run build` clean.
- Live smoke: `GET /recommend?min_protein=30` all ≥30g; `/optimize_meal?min_protein=40`
  each meal ≥40g; negative → 422.
