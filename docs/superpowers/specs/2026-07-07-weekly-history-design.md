# Weekly History / Trends on the Today Tab — Design

**Date:** 2026-07-07
**Status:** Approved
**Track:** C (new features), feature 15

## Problem

The Today tab lets a user set daily nutrition targets and log meals against them, but the
log **resets every calendar day with no memory**. `dailyLog` is `{ date, entries[] }` for
*today only*; `loadDailyLog()` returns a fresh empty day whenever the stored date ≠
`today()`, and both mount and `logMealToToday` discard the previous day. So a user can never
see whether they hit their goals *consistently* — the core value of a tracker is lost.

## Goal

A **7-day history**: as each day rolls over, archive its totals, and add a **"This week"**
section to the Today tab showing daily calories vs target across the last 7 days plus 7-day
averages for the tracked nutrients. Frontend-only, localStorage.

## Storage approach

Archive *past-day totals* into a new `crave_history` store — an array of
`{ date: "YYYY-MM-DD", totals: {calories, protein, sugars, fat} }` for **completed past days
only** (today stays live in `dailyLog`). A trends view needs totals, not per-meal detail, so
this keeps today's working model untouched (lowest risk) and stays compact. Rejected: a
unified per-date entries map (bigger refactor + migration; per-day meal drill-down isn't a
v1 need).

## Data model & persistence (`fast-food-ui/src/App.jsx`)

- New `history` state + persist `useEffect` to `crave_history` (mirrors `dailyLog`/`targets`).
- New module-level **pure** helpers (verifiable without a browser):
  - `loadHistory()` — read + validate `crave_history` → array (defensive, like `loadDailyLog`).
  - `mergeDay(history, dayLog)` — add `{date, totals: sumDailyLog(dayLog.entries)}`, replacing
    any same-date entry, sorted date-desc, pruned to the last 30 days. Reuses `sumDailyLog`.
  - `lastNDates(n)` — the last `n` local calendar dates ending today, via
    `d.setDate(d.getDate()-i)` + the same hand-built local format as `today()` (avoids the
    UTC off-by-one `toISOString` would cause).
  - `weeklyAverages(dayTotalsList)` — per-nutrient average across the week.
- **Archiving on rollover** (the two existing rollover sites):
  - *Mount:* in `loadDailyLog()`, when the stored day is stale AND has entries, archive it to
    `crave_history` before returning fresh. The `dailyLog` initializer runs before the new
    `history` initializer (declaration order), so `loadHistory()` sees the archived value.
  - *Same session:* in `logMealToToday`, if `dailyLog.date ≠ today()` and it has entries,
    `setHistory(h => mergeDay(h, dailyLog))` before the reset (reads the `dailyLog` closure so
    the `setDailyLog` updater stays pure).
- `resetDay` unchanged (clears today only, never history).

## Weekly view UI (Today tab)

- New **"This week"** section after "Logged meals". A memo derives the 7-day series: for each
  date in `lastNDates(7)`, `totals = date === today() ? dailyTotals :
  (history.find(h => h.date === date)?.totals ?? zeros)`.
- **Chart:** a 7-column **calories** bar chart with a horizontal **target reference line**,
  day labels (Mon/Tue/…) beneath, bars colored with existing semantics (within budget =
  accent, over target = red `--over`). CSS/flexbox `<div>` bars — no charting lib — matching
  the hand-rolled `macroRing`/`breakdownBar` style. The `dataviz` skill guides palette,
  light/dark contrast, and reference-line/label conventions.
- Below: a compact **7-day averages** line for the 4 `TARGET_NUTRIENTS`, colored vs target.
- Empty-state hint when the whole week is zero.
- Update the Today intro copy from "reset each calendar day" to reflect the 7-day history.

## CSS (`fast-food-ui/src/App.css`)

`.weekHistory`, `.weekChart`, `.weekBarCol`, `.weekBar`, `.weekBar--over`, `.weekTargetLine`,
`.weekDayLabel`, `.weekAverages` (+ dark overrides), using the existing token system so dark
mode is inherited (same pattern as `.targetBar`/`.macroRingsCard`).

## Verification

Frontend-only (no backend test suite — matches Track A / Compare / Saved-meals precedent):

1. `cd fast-food-ui && npm run lint && npm run build`.
2. Pure-logic Node check of `mergeDay` / `lastNDates` / `weeklyAverages` (dedup by date +
   prune to 30; `lastNDates(7)` = 7 consecutive local dates ending today).
3. Manual smoke: log a meal → today's bar; seed `crave_history` via devtools → past days +
   target line + averages render; dark mode correct.

## Out of scope (v1)

- Per-day meal drill-down (history stores totals only).
- Ranges other than 7 days; switching the charted nutrient (calories only).
- Server/cross-device history (separate account-backed track).

## Rollout

Feature branch `track-c-weekly-history` → spec commit → impl commit → CI green → user OK →
merge to main (prod deploy) → verify live on the Vercel bundle.
