# Compare Mode — Design

**Date:** 2026-07-02
**Status:** Approved
**Scope:** Frontend-only (`fast-food-ui/src/App.jsx` + `App.css`). No backend, data, or infra change.

## Problem

Today the only side-by-side comparison in Crave is the **Alternative Meals** delta
view in the Meal Builder, which compares optimizer alternatives against the *current*
meal only. Users routinely want to answer "which of these is healthier?" for arbitrary
items (e.g. Big Mac vs Dave's Single vs a McChicken) and have no way to line them up.

## Solution

A new **Compare** tab where the user collects 2–3 things — any mix of individual menu
items and full meals — and sees their nutrition side-by-side, with the best value per
nutrient highlighted green and the worst red (direction-aware).

## Decisions

- **What compares:** items AND full meals, mixed. Each column is a *compare entry*
  `{ id, kind: "item"|"meal", label, items: [...] }`. A single item is `items: [item]`,
  so nutrition is uniform via `sumNutrition(entry.items)`.
- **Adding (mirrors `addToMeal`, no new search UI):**
  - "Add to Compare" in the Browse item **modal** (beside "Add to Meal").
  - "⚖️ Compare" in the Meal Builder **action row** (adds the current meal).
  - "Compare" action on each **saved meal** row.
- **Display:** nutrient-row table, one column per entry, **best/worst highlighting**
  (no fixed baseline). Direction-aware: protein higher = better; calories, sugars,
  fat, carbs, sodium lower = better. All-equal → no highlight.
- **Persistence:** ephemeral React state only. Clears on reload. No localStorage.
- **Cap:** max **3** columns; add controls disable ("Compare full (3)") when full.
- **Nutrition-only rows** (calories, protein, sugars, fat, carbs, sodium). Health
  **score is intentionally excluded** — score is per-goal and a built meal has no
  single client-side score, so a nutrition-only table keeps item and meal columns
  uniform and honest.

## Reused building blocks

- `sumNutrition(items)` — per-column totals (already the single source of truth).
- Green `#047857` / red `#b91c1c` / gray semantics from `deltaStyle` — reused by a
  new `bestWorstStyle(values, index, higherIsBetter)` helper (per-row best/worst
  instead of delta-vs-base).
- `getItemKey`, `defaultMealName`, the tab switcher, and the `.altCard`/`.deltaRow`
  CSS patterns.

## Out of scope (YAGNI)

localStorage persistence, >3 columns, a health-score row, sharing/exporting a
comparison, comparison-via-URL, any backend change.

## Verification

- `cd fast-food-ui && npm run lint && npm run build` clean.
- Manual walkthrough: add 2 items + 1 meal → 3 columns; direction-correct highlighting;
  4th add blocked; remove → add works; reload clears; dark mode renders.
