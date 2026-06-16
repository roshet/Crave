# OG Preview Cards for Shared Meals — Design

**Date:** 2026-06-16
**Status:** Approved
**Track:** C (new features)

## Problem

Track C shipped shareable meal URLs (`?meal=<item_ids>`): the "🔗 Share Meal" button copies a
link, and on load the SPA rehydrates the meal via `GET /items?ids=`. But when that link is
pasted into iMessage / Slack / Discord / Twitter / Facebook, the preview is blank: `index.html`
ships **no Open Graph tags** and the `<title>` is still the Vite default `fast-food-ui`.

## Goal

A shared link renders a rich preview card — meal name, item count, calories, protein, and a
branded image — so sharing looks good. Composes on the existing shareable-URL work; no datastore
or auth.

## Key constraint (drives the whole design)

Social crawlers (`facebookexternalhit`, `Twitterbot`, `Slackbot`, `Discordbot`, …) fetch HTML
and read `<meta property="og:*">` **without running JS**. A static SPA serves identical HTML for
every URL, so the existing client-side `?meal=` rehydration can never produce a per-meal
preview. Per-meal previews require **server-rendered meta tags**, which means introducing the
project's first **Vercel Functions** (free on the Hobby plan; project Root Directory is
`fast-food-ui`).

## Approach

Two small Vercel Functions under `fast-food-ui/api/`, wired with a new `fast-food-ui/vercel.json`.
Both reuse the existing backend `GET /items?ids=` for live nutrition (same composition as the
share flow). Server-to-server calls, so no `CORS_ORIGINS` change.

### Fork: UA-gated rewrite (chosen) vs unconditional rewrite

**Chosen — UA-gated.** A `vercel.json` rewrite with a `has` header condition matching known
crawler user-agents (and a `has` query condition requiring `meal`) routes only crawler requests
to `/?meal=…` → `/api/share`. Humans keep the current fast static SPA path **exactly as today**,
so there is zero regression risk to the shipped share flow.

**Rejected — unconditional.** Rewrite every `/?meal=` request through the function (simpler
`has`, query-only). Adds latency and a Render cold-start dependency to *every* human link open,
endangering the working flow. Not worth it.

### Fork: live backend fetch with fallback (chosen) vs self-contained URL

The shared URL carries only ids, not nutrition, so showing calories/macros requires fetching
`/items`. Render's free tier sleeps after ~15 min, so the first crawler hit may be slow/cold.
Both functions therefore use a **short fetch timeout and a generic fallback card / generic meta**
when the backend is unreachable — a broken image is worse than a generic one. Rejected:
encoding nutrition in the URL (long, freezes stale, duplicates the share-URL design we already
rejected in PR #5).

### Image generation: `@vercel/og`

`@vercel/og`'s `ImageResponse` (Satori) renders a 1200×630 PNG from JSX on the Edge runtime —
the canonical Vercel way to make dynamic OG images, no headless browser.

## Backend

No backend change. Reuses `GET /items?ids=` (`api.py:187`) and the opaque-string `item_id` rule
from PR #5 (McDonald's/Taco Bell ints, Chick-fil-A slugs, **Wendy's names with spaces/apostrophes**).

## Frontend / infra (all under `fast-food-ui/`)

1. **`vercel.json`** (new) — `rewrites`: `source: "/"` with two `has` entries (crawler
   `user-agent` regex + `meal` query present) → `destination: "/api/share"`; `functions`: set
   `api/og.*` to the Edge runtime. Must live in `fast-food-ui/` (project Root Directory).
2. **`api/og.jsx`** (new, Edge) — `ImageResponse` card: "Crave" wordmark, meal title
   (`<first item> +N more`), `N items · X kcal · Yg protein`, first few item titles. Reads
   `meal` ids, `fetch(${BACKEND_URL}/items?ids=…)`, generic fallback on failure.
3. **`api/share.js`** (new, Node) — `fetch(https://${VERCEL_URL}/index.html)` (avoids a rewrite
   loop), `fetch(${BACKEND_URL}/items?ids=…)` for title/description, inject `og:*` +
   `twitter:card=summary_large_image` into `<head>` with `og:image=/api/og?meal=<ids>`, return
   `text/html`. SPA still boots and rehydrates (crawlers ignore JS; a rare human routed here
   still gets a working page).
4. **`index.html`** — fix `<title>`, add **baseline static** OG/Twitter tags (generic
   title/description + static `/api/og` image) so the homepage previews too; `/api/share`
   overrides per-meal for crawlers.
5. **`package.json`** — add `@vercel/og` to `dependencies`.
6. **`eslint.config.js`** — ensure `eslint .` (CI) handles `api/` (right globals or ignore).
7. **Vercel env var** `BACKEND_URL=https://crave-2jtg.onrender.com` (Preview + Production) —
   functions read `process.env`, not the build-time `VITE_API_BASE_URL`.

## Out of scope (YAGNI)

Server-side short links, saved-meal names in the URL, sharing goal/filter context,
account-backed cross-device meals, per-crawler card variants.

## Testing / verification

CI (`npm ci` + lint + build, then pytest) does not exercise Vercel Functions. Real verification
is on a Vercel **preview deploy**:

- `cd fast-food-ui && npm install && npm run lint && npm run build` passes (CLAUDE.md gate).
- `curl '<preview>/api/og?meal=600000,Dave%27s%20Single'` → `image/png`; confirm cold-backend
  fallback card.
- `curl -A 'facebookexternalhit/1.1' '<preview>/?meal=600000,Dave%27s%20Single'` → HTML has
  per-meal `og:title`/`og:description` + `og:image=…/api/og?meal=…`.
- Plain browser open of `/?meal=…` (no crawler UA) → unchanged: Meal Builder rehydrates, param
  stripped (must not regress).
- Paste preview link into an OG debugger (opengraph.dev / platform validator).
- Mixed-restaurant meal incl. a Wendy's apostrophe-id and a Taco Bell int-id to confirm id
  encoding survives end-to-end.

## Delivery

Feature branch `track-c-og-preview-cards` → spec commit first → implementation → PR (CI gates
main). Merge-to-main triggers prod deploy; get explicit user OK before merge (same as PR #5/#6/#7).
After deploy, set `BACKEND_URL` in Production and re-verify the live card.
