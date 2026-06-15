# Daily Nutrition Targets & Tracking — Design

**Date:** 2026-06-15
**Status:** Approved
**Track:** C (new features), feature 2 of 2 so far (after shareable meal URLs)

## Problem

Crave is a single-session meal builder — you assemble one meal, see how it scores, and
that's it. Nothing carries across the day. A user trying to eat within a daily budget has no
way to set targets or see how a meal fits into what they've already eaten.

## Goal

Day-level tracking: set daily nutrition targets, log meals to "today" as they're built, and
see running totals vs. remaining budget that persist across reloads and reset on a new
calendar day.

Scope confirmed with user: **true day-level tracking** (log + accumulate + persist + daily
reset), not merely showing one meal against a target.

## Approach

Frontend-only (no backend, no new data). A new **"Today" tab** holds targets, progress, and
the day's logged meals; the Meal Builder gains a single **"Log to Today"** button. All state
persists in `localStorage`, mirroring the existing `theme` persistence pattern.

### Data shapes (localStorage)
- `crave_targets` → `{ calories: 2000, protein: 100, sugars: 50, fat: 70 }` — persists across
  days; user-editable. Defaults are sensible round numbers.
- `crave_daily_log` → `{ date: "YYYY-MM-DD", entries: [ { id, label, totals, loggedAt } ] }`
  where `totals` is a `sumNutrition` result and `label` is the comma-joined item names.

### Daily reset
`today()` = `new Date().toISOString().slice(0, 10)`. On mount and on every log action, if the
stored `crave_daily_log.date !== today()`, replace `entries` with `[]` and set `date` to
today. **Targets are never reset.**

### Nutrients tracked
Calories + protein + sugar + fat — the four already surfaced in `getGoalBadges`/`mealTotals`.
Sodium and carbs exist in the data but are intentionally excluded to keep the UI focused.

## Components — all in `fast-food-ui/src/App.jsx` (+ `App.css`)

1. **State + persistence** (near the `theme` block): `targets`/`setTargets` and
   `dailyLog`/`setDailyLog`, each lazy-initialized from `localStorage` and written back via
   `useEffect`, exactly like `theme`. The `dailyLog` initializer applies the date-reset check.
2. **Module-level helpers** (near `sumNutrition`): `today()` (ISO date) and
   `sumDailyLog(entries)` (reduce `entry.totals` into a day total, reusing the same nutrient
   keys as `sumNutrition` — no parallel reduce).
3. **Actions** (near `clearMeal`/`shareMeal`): `logMealToToday()` (builds an entry with
   `crypto.randomUUID()`, label, `sumNutrition(meal)` totals, timestamp; applies date-reset;
   appends), `removeLogEntry(id)`, `resetDay()`.
4. **Meal Builder button**: `➕ Log to Today` in the `actionRow` next to Share, inside the
   existing `meal.length > 0` branch.
5. **Tab + panel**: add `{ id: "today", label: "Today" }` to the inline tabs array and a
   `{activeTab === "today" && ( … )}` panel.
6. **Today panel**: editable target inputs (clamp `>= 0`, `NaN → 0`, each `aria-label`led per
   the Track A a11y conventions); one progress bar per nutrient (`consumed / target` + remaining,
   width capped at 100%, over-budget styled red via the existing success/failure color tokens);
   logged-meals list (label + totals + remove ✕); "Reset day" button; empty state.
7. **CSS**: `.targetRow`, `.targetBar`, `.targetBar--over`, `.targetFill`, and log-list
   classes, with `:root[data-theme="dark"]` parity, following existing conventions.

### Reuse
- `sumNutrition(items)` for entry + day totals.
- `getItemKey` / `title || name` for the entry label.
- `.goalBadge--success` / `.goalBadge--failure` color semantics for over/under styling.

## Out of scope (YAGNI)
Multi-day history/streaks, charts, meal-type slots (breakfast/lunch), cross-device sync,
sodium/carb targets.

## Testing
Frontend-only; CI still runs both jobs. `cd fast-food-ui && npm run lint && npm run build`.

Manual end-to-end (`npm run dev`):
1. Edit targets → reload → persist.
2. Build a meal → Log to Today → entry appears, progress advances, remaining decreases.
3. Log a second meal → totals accumulate; push a nutrient over target → red/over styling.
4. Remove an entry / Reset day → totals recompute.
5. Reload → log persists. Set `crave_daily_log.date` to yesterday in localStorage + reload →
   entries reset, targets unchanged.

## Delivery
Feature branch `track-c-daily-targets` → PR (CI gates main) → Vercel auto-deploy. Merge to
main triggers prod deploy and needs explicit user authorization (auto-mode classifier blocks
it otherwise).
