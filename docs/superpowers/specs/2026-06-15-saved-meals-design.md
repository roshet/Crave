# Saved Meals (local) — Design

**Date:** 2026-06-15
**Status:** Approved
**Track:** C (new features), feature 3 (after shareable meal URLs + daily targets)

## Problem

A meal you build in Crave is ephemeral — clearing it or reloading the page loses it. There's no
way to keep a meal you like and come back to it.

## Goal

Name a built meal, save it, and load it back into the Meal Builder anytime. Frontend-only,
persisted in `localStorage`.

Scope confirmed with user: **local saved meals, no accounts.** Account-backed cross-device
saving is explicitly deferred (needs a datastore + auth + infra decisions).

## Approach

Saved meals live **inside the Meal Builder tab** (no new tab — the bar is already
Browse/Meal/Optimize/Today). A "💾 Save meal" control with a name field, plus a "Saved meals"
list that renders **always** (even when the current meal is empty) so a saved meal can be loaded
at any time. Reuses the `localStorage` lazy-init + `useEffect`-write pattern (theme,
`crave_targets`, `crave_daily_log`) and `sumNutrition`.

Composes with shipped features: a loaded saved meal carries `item_id`s, so **Share Meal** and
**Log to Today** work on it unchanged.

### Data shape (localStorage)
`crave_saved_meals` → `[ { id, name, items, savedAt } ]`, where `items` is the full meal array
(objects already carry `item_id` + nutrition). Storing full objects makes load instant/offline;
nutrition is frozen at save-time, consistent with the `crave_daily_log` snapshot precedent.

## Components — all in `fast-food-ui/src/App.jsx` (+ `App.css`)

1. **State + persistence** (near `targets`/`dailyLog`): `savedMeals`/`setSavedMeals`, lazy-init
   from `localStorage` (`crave_saved_meals`, default `[]`, guarded parse), `useEffect` writes on
   change. Plus `mealName`/`setMealName` (input) and `saveSuccess`/`setSaveSuccess` (flash).
2. **Helper** (module-level, near `sumNutrition`/`sumDailyLog`): `defaultMealName(items)` →
   first item title, with ` +N more` when there's more than one.
3. **Actions** (in `App`, near `logMealToToday`/`clearMeal`):
   - `saveMeal()` — name = trimmed input or `defaultMealName(meal)`; prepend
     `{ id: crypto.randomUUID() ?? String(Date.now()), name, items: meal, savedAt: Date.now() }`;
     clear input; 2s "✓ Saved!" flash.
   - `loadSavedMeal(id)` — `setMeal(items)` + reset `alternativeMeals`/`optimizedMealResults`
     (same cleanup as `clearMeal`); stay on the Meal Builder tab.
   - `deleteSavedMeal(id)` — filter out of `savedMeals`.
4. **Saved Meals section** — a `<section className="savedMeals">` rendered after the meal
   build/empty ternary, inside the Meal Builder tab, so it shows regardless of meal length:
   - Header "Saved meals".
   - Save row: name `<input>` (optional, `aria-label`led) + "💾 Save meal" button **disabled when
     `meal.length === 0`**; button flashes "✓ Saved!".
   - List: name + brief (`<count> items · <kcal> kcal` via `sumNutrition`), **Load** + **Delete**
     ✕ (`aria-label`led). Empty state when none saved.
5. **CSS** (`App.css`): `.savedMeals`, `.savedMealSaveRow`, `.savedMealRow`, etc., following the
   `.loggedMeals`/`.targetEditor` conventions, with `:root[data-theme="dark"]` parity.

### Reuse
- `sumNutrition(items)` for the per-saved-meal brief.
- `getItemKey` for list keys; `title || name` for labels.
- `localStorage` lazy-init + `useEffect` pattern; 2s success-flash pattern.

## Out of scope (YAGNI)
Accounts / backend / cross-device sync, rename-in-place, per-saved Share button (Load then
Share), dedupe by name, save-count caps.

## Testing
Frontend-only; CI still runs both jobs. `cd fast-food-ui && npm run lint && npm run build`.

Manual (`npm run dev`):
1. Build a meal, name it, **Save** → appears with right count/kcal; input clears, button flashes.
2. Save with blank name → auto `"<item> +N more"`.
3. **Clear** current meal → list persists; **Load** one → builder repopulates; **Share Meal** and
   **Log to Today** then work on it.
4. **Delete** → removed.
5. Reload → persists.

## Delivery
Feature branch `track-c-saved-meals` → PR (CI gates main) → Vercel auto-deploy. Merge to main
triggers prod deploy → needs explicit user authorization.
