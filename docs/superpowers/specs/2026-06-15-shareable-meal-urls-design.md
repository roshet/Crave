# Shareable Meal URLs — Design

**Date:** 2026-06-15
**Status:** Approved
**Track:** C (new features)

## Problem

Crave lets a user build a meal in the Meal Builder tab, but there is no way to send that
meal to another person. The only export today is "Copy Summary," which produces plain text,
not something the recipient can open and interact with.

## Goal

Add a **Share** button that produces a link such as
`https://fast-food-ui.vercel.app/?meal=600001,chickfila_spicy_chicken_biscuit,Dave's%20Single`.
Opening that link rehydrates the exact meal into the Meal Builder, with live nutrition.

## Approach

**IDs + lookup endpoint** (chosen over a self-contained snapshot).

The URL carries the meal's `item_id`s. On load, the frontend calls a new lightweight backend
endpoint to rehydrate the full items. This keeps URLs short and guarantees the displayed
nutrition always reflects current data. Trade-off: it needs one small new endpoint, and a
link silently drops any item later deleted from the dataset (the rest still load).

The rejected alternative — encoding the whole meal (titles + nutrition) as base64 JSON in the
URL — needs no backend but yields long URLs and freezes nutrition at share-time (can go
stale), so it was not chosen.

### Key constraint: `item_id` is an opaque string

Datasets use different id types, so ids must never be coerced to int:

- McDonald's / Taco Bell → integers (`200463`, `600001`)
- Chick-fil-A → URL-safe slugs (`chickfila_spicy_chicken_biscuit`)
- Wendy's → human names **with spaces and apostrophes** (`Dave's Single`)

Therefore: key the backend lookup on `str(item_id)`; URL-encode each id segment on the
frontend. Commas are safe as the separator because no id contains a comma.

## Backend (`ingest/api.py`)

1. **Startup index:** after `ALL_ITEMS` is built, add
   `ITEMS_BY_ID = {str(it["item_id"]): it for it in ALL_ITEMS if it.get("item_id") is not None}`.
2. **`GET /items?ids=...`** (required `ids` query string):
   - Empty / whitespace-only → `400` (consistent with the existing invalid-`category` → 400).
   - Split on `,`, strip, drop blanks; look up each in `ITEMS_BY_ID` by string. Unknown ids
     are silently skipped; result order follows the `ids` order.
   - Returns `{"results": humanize_items(matched)}` — same shape as
     `/recommend?format=human`'s `results`, reusing `humanize_items` (`recommend_items.py`).

## Frontend (`fast-food-ui/src/App.jsx`)

3. **Share button** in the Meal Builder action row, mirroring the existing
   `exportMeal()` / `copySuccess` clipboard pattern: new `shareMeal()` + `shareSuccess` state
   build `meal.map(getItemKey).map(encodeURIComponent).join(",")`, compose
   `${window.location.origin}/?meal=${ids}`, copy via `navigator.clipboard`, flip a 2s
   "Link copied!" confirmation, fall back to `setError` on failure.
4. **Load-on-mount** `useEffect`: parse `?meal=`; if present, fetch `/items?ids=...`,
   `setMeal(results)`, switch to the Meal Builder tab, then strip the param via
   `history.replaceState` so the address bar stays clean. Fetch failures fail quietly (empty
   Meal Builder) so a link to since-deleted items never breaks the app.

## Out of scope (YAGNI)

Saved/named meals, server-side short links, sharing goal/filter context, OG preview cards.

## Testing

- Backend `ingest/test_api.py` (TestClient): valid ids round-trip in order; a Wendy's
  string id (`Dave's Single`) resolves; unknown id skipped; empty `ids` → 400.
- `cd ingest && python -c "import api" && pytest`
- `cd fast-food-ui && npm run lint && npm run build`
- Manual end-to-end: build a meal, Share, open the link in a fresh tab, confirm the Meal
  Builder is pre-populated with matching items and totals (incl. a Wendy's item and a
  mixed-restaurant meal).

## Delivery

Feature branch `track-c-shareable-meals` → PR (CI gates main) → Vercel + Render auto-deploy.
