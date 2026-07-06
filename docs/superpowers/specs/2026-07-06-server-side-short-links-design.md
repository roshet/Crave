# Server-side short links for shared meals — Design

**Date:** 2026-07-06
**Status:** Approved
**Track:** C (new features), feature 12

## Problem

The "🔗 Share Meal" button copies a link that inlines every item id:
`/?meal=Dave's%20Single,600000,chickfila_cool_wrap`. It works, but it's long and ugly —
Wendy's ids are human names with spaces/apostrophes, so a 3-item meal produces a sprawling
URL that reads badly pasted into a text or tweet.

## Goal

Add short links: `/m/x7k2qp`. The copied/shared link is compact; opening it loads the same
meal. Backed by a Vercel-hosted key-value store (Upstash Redis, free tier).

The earlier "needs a persistent store; Render free tier is ephemeral" concern does not
apply here — the entire share/OG stack already runs on **Vercel** (`api/og.js`,
`api/share.js`, `middleware.js`, added in Track C feature 4), and Vercel offers a free
managed Upstash Redis. No Render involvement.

## Design principle: resolve server-side, then reuse what already works

A short link is resolved to its ids server-side and then handed off to the flows that are
already proven: the App.jsx `?meal=` rehydration effect and the `api/share.js` OG renderer
both stay **unchanged**. Everything degrades to today's long-link behavior when the store
is absent (local dev, or before provisioning), so nothing can break in the interim.

## Prerequisite (infra)

Provision **Upstash Redis** on the Vercel `fast-food-ui` project (Marketplace → Upstash,
free tier). It injects `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; older
integrations use `KV_REST_API_URL`/`KV_REST_API_TOKEN`. The code reads either pair. Check
for an existing store first with `vercel env ls`.

## KV access

Upstash's REST API is called with `fetch` (works in Node functions and Edge middleware
alike), so no new npm dependency. Two operations, each `POST ${URL}` with a JSON command
array and `Authorization: Bearer ${TOKEN}`:

- write: `["SET", "meal:<code>", "<ids>", "NX"]` → `{ result: "OK" | null }` (null =
  key already exists → collision).
- read:  `["GET", "meal:<code>"]` → `{ result: "<ids>" | null }`.

The ~10-line helper is inlined in each file that needs it (`api/shorten.js`,
`middleware.js`) rather than shared through an import — the project's history has several
Vercel function-bundler gotchas, so the per-function surface is kept minimal and
self-contained. When the env vars are absent the helper reports "unavailable" and callers
degrade gracefully.

## Components

### `api/shorten.js` (new — POST, create a link)

- Body: JSON `{ ids: "<comma-joined, URL-encoded ids>" }` — the same string shape the
  existing `GET /items?ids=` consumes.
- Validate: non-empty, length ≤ 4000, ≤ 30 comma-separated items → else `400`. Method
  other than POST → `405`.
- Generate a 7-char base62 code from `crypto.randomBytes`; `SET meal:<code> ids NX`; on a
  null result (collision) regenerate, up to 3 attempts. No TTL — shared links shouldn't
  expire.
- Return `{ code }` (200). Missing env or a KV error → `503`, which makes the client fall
  back to the long link.

### `middleware.js` (extend — resolve a link)

Widen `config.matcher` from `"/"` to `["/", "/m/:code*"]`. The existing `/` bot→
`/api/share` behavior is unchanged. New branch: on `/m/<code>`, read `meal:<code>`:

- **found + crawler UA** → `rewrite("/api/share?meal=<ids>")`. Reuses `api/share.js`
  unchanged, so a short link shared into social still renders the per-meal OG card.
- **found + human** → `307` redirect to `/?meal=<ids>`. Reuses the App.jsx rehydration
  effect unchanged. The copied/shared link stays short; a recipient's address bar expands
  to the long form only *after* they open it — an accepted v1 tradeoff (see Non-goals).
- **not found / KV unavailable** → `307` redirect to `/`.

The redirect is a native `new Response(null, { status: 307, headers: { Location } })`;
`rewrite`/`next` from `@vercel/functions` cover the other branches. Humans still fetch
`/items` client-side, so a cold Render backend degrades exactly as it does today.

### `App.jsx` — `shareMeal()` (change)

- Build the same `ids` string as today (`getItemKey`, each URL-encoded, comma-joined).
- `POST` it to `/api/shorten` at `window.location.origin` — note `/api/*` is a **Vercel**
  function on the frontend origin, **not** the Render backend (`API_BASE_URL`).
- Success → copy `${origin}/m/${code}`. Any failure (offline, 503, local dev with no
  functions, a non-Vercel host) → copy the existing `${origin}/?meal=${ids}` long link.
  Sharing never breaks; the rehydration effect accepts either.

## Non-goals (v1)

- Keeping `/m/<code>` visible in the address bar after open (needs a resolve endpoint +
  client-side path routing).
- Link analytics, expiry / garbage collection.
- Rate-limiting `/api/shorten` beyond the payload caps above.

## Verification

1. `cd fast-food-ui && npm run lint && npm run build` (api/ + middleware are linted by the
   existing `api/**` eslint block and sit outside the Vite build).
2. Local dev fallback: `npm run dev`, build a meal, Share → with no `/api/shorten`
   available the copied link is the long `?meal=` form and still rehydrates. (The frontend
   has no JS test runner; serverless functions are verified live, matching the feature-4
   precedent.)
3. After provisioning + deploy:
   - `curl -X POST .../api/shorten -H 'content-type:application/json' -d '{"ids":"600000,Dave%27s%20Single"}'` → `{ "code": "..." }`.
   - `curl -sI .../m/<code>` (normal UA) → `307` to `/?meal=...`.
   - `curl -s -A 'Twitterbot' .../m/<code>` → HTML carrying the per-meal `og:title` /
     `og:image` (proves the code resolves on the OG path).
   - Browser: build a meal → Share → paste the short link → same meal loads on Meal Builder.

## Rollout

Feature branch `track-c-short-links` → spec commit → (user provisions Upstash) → impl
commit → CI green → user OK → merge to main (prod deploy) → live smoke → mark shipped.
