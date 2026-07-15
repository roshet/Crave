# Saved-meals library sync via a code

**Date:** 2026-07-15
**Status:** Approved
**Type:** Track C feature (frontend + Vercel serverless + Upstash KV; no Render backend change)

## Problem

The "Saved meals" library (`crave_saved_meals` in `localStorage`, rendered in the Meal Builder
tab's saved-meals section) is trapped on one device. Users who build a library on their phone
can't get it onto their laptop.

Full account-backed sync would need a database and auth. Instead, deliver the cross-device
value by reusing the Upstash KV + short-code machinery already in production (`api/shorten.js`,
`api/resolve.js`, `GET /items`).

Honest framing: with no auth this is **export/import via a code**, not continuous sync. A user
mints a code for their current library and pastes it on another device to import. Non-goals:
real-time sync, accounts, conflict resolution beyond dedup.

## Approach — reuse the KV + code + `/items` pattern

Follows feature 12's decisions: store **ids, not full snapshots** (small payloads,
always-current nutrition), and re-resolve items via the existing `GET /items` endpoint on
import.

### 1. New `fast-food-ui/api/library.js`

One serverless file, dispatched by method. Reuses the inlined KV REST pattern from
`api/shorten.js`: `KV_URL`/`KV_TOKEN` with the `UPSTASH_REDIS_REST_* || KV_REST_API_*` fallback
and a `kvCommand(...)` helper. Key namespace `lib:<code>` (kept separate from `meal:<code>`).

- **POST** `{ library: [{ name, ids: [...] }] }`
  - Validate: array present, ≤ 50 meals, serialized JSON ≤ 40 KB.
  - `SET lib:<code> <json> NX` with a 7-char base62 code (same alphabet as `shorten.js`), retry
    on collision.
  - 200 `{ code }` / 400 bad-or-empty body / 400 too-large / 503 KV down. `Cache-Control:
    no-store`.
- **GET** `?code=<code>`
  - `GET lib:<code>`, JSON-parse.
  - 200 `{ library }` / 400 missing code / 404 unknown / 503 KV down. `Cache-Control: no-store`.
- 405 for any other method (`Allow: GET, POST`).

### 2. New pure helper `mergeLibrary(existing, incoming)` in `fast-food-ui/src/helpers.js`

Append imported meals to the device's library, **skipping exact duplicates** — same `name` and
same ordered id-set (signature built from `getItemKey`). Guarantees import never wipes existing
saved meals and re-import is idempotent. Pure and side-effect free (no input mutation) so it can
be unit-tested directly.

### 3. `fast-food-ui/src/App.jsx` — two handlers (state stays in App)

- `exportLibrary()`: map `savedMeals` → `[{ name, ids: items.map(getItemKey) }]`; `POST` to
  `${window.location.origin}/api/library` (a **Vercel** function on the frontend origin, NOT
  `API_BASE_URL`/Render — same rule as `/api/shorten`); on success set a `libraryCode` state and
  copy it to the clipboard; fail quietly with an error message. Guard: no-op when `savedMeals`
  is empty.
- `importLibrary(code)`: `GET ${origin}/api/library?code=`; collect the union of all ids across
  meals; one `GET ${API_BASE_URL}/items?ids=<each encodeURIComponent'd, comma-joined>` (reuse
  the meal-link encoding); build an id→item map; reconstruct each meal's `items` in order
  (skip ids that didn't resolve; drop a meal left empty); wrap each as
  `{ id: crypto.randomUUID(), name, items, savedAt: Date.now() }`; then
  `setSavedMeals(prev => mergeLibrary(prev, rebuilt))`. Fail quietly with an error message.

### 4. `fast-food-ui/src/tabs/MealBuilderTab.jsx` — UI in the Saved meals section

Add a compact row under the "Saved meals" title:
- "⬆️ Share library" button — disabled when `savedMeals` is empty; on success shows the code and
  a "copied" state.
- A small code input + "⬇️ Restore" button — imports the pasted code.

New props threaded from App: `exportLibrary, libraryCode, libraryShareSuccess, importLibrary,
importError`. New CSS classes beside the existing `.savedMeal*` rules, with dark-mode overrides.

## Key decisions

- **Import = merge-append with dedup**, never replace — safest default; re-import is a no-op.
- **Store ids + names, re-resolve on import** — matches feature 12; small blob, live nutrition.
- **Code, not a URL** — user copies a 7-char code and pastes it to restore. A `/?lib=<code>`
  auto-import deep link is a possible v2 (mount-effect + auto-merge-consent complexity) — out of
  scope now.

## Testing

**Automated (`fast-food-ui`, Vitest + jsdom):**
- `helpers.test.js`: `mergeLibrary` — append; dedup exact (name + ordered id-set); keep a
  same-name/different-items meal; no mutation of inputs.
- `App.test.jsx` / a MealBuilderTab render test: export round-trip (mock `/api/library` POST →
  `{ code }`, click Share library, assert code surfaces); import (mock `/api/library` GET → a
  library and `/items` → items, Restore a code, assert a saved-meal row appears; re-restore →
  no duplicate).
- Gate: `npm run lint && npm run test && npm run build`; backend untouched, `python -c "import
  api"` for hygiene.

**Manual / live** (`api/library.js` is serverless; Vercel previews sit behind Deployment
Protection, so verify on the **production** alias after merge — safe because every failure path
degrades to an "unavailable" message with the local library intact):
1. Save 2–3 meals → Share library → get a code; in a fresh browser/incognito → Restore with the
   code → meals appear.
2. Re-Restore the same code → no duplicates.
3. Bogus code → clean "not found" message, existing library untouched.

## Rollout

Branch `track-c-library-sync` off `main`; PR with CI green; ask before merging (merge →
production deploy); live-verify on prod.
