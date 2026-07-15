# Short-link permalink: keep `/m/<code>` in the address bar

**Date:** 2026-07-15
**Status:** Approved
**Type:** Track C feature (frontend + Vercel edge/serverless; no Render backend change)

## Problem

Crave's server-side short meal links (`/m/<code>`, shipped as feature 12 — see
`2026-07-06-server-side-short-links-design.md`) disappear from the address bar the moment
they open. A recipient therefore can't copy the short URL back out, bookmark it, or reload
it. The link is lost in two steps:

1. `middleware.js` issues a **307 redirect** `/m/<code>` → `/?meal=<ids>` for human (non-bot)
   requests.
2. The App.jsx mount rehydration effect then strips the query with
   `window.history.replaceState({}, "", window.location.pathname)`, leaving `/`.

Keeping `/m/<code>` visible after open was explicitly listed as out-of-scope in the feature 12
spec ("needs a resolve endpoint + client routing"). This spec delivers it.

## Goal

A human who opens `/m/<code>` lands on the Meal Builder with the meal loaded **and the URL
still reads `/m/<code>`** — a real permalink they can copy, bookmark, and reload.

Non-goals / unchanged:
- Bot / Open-Graph behavior (the OG card for chat unfurls).
- The long `?meal=<ids>` fallback link (still strips to `/` on open — it's the fallback, not
  meant to persist).
- No client-side router is introduced.

## Approach: serve the SPA in place, resolve client-side

The browser can only keep `/m/<code>` visible if the server **rewrites** (serves the SPA
without changing the URL) rather than **redirects**. A rewrite's target query string is not
visible to client JS, so the SPA cannot read `?meal=` from it — instead the SPA reads the
`<code>` from `location.pathname` and resolves it to ids via a small endpoint, then reuses the
existing item-loading path. This mirrors how the app already reads `?meal=` today.

### 1. `fast-food-ui/middleware.js`

On `/m/<code>`:
- **Bots** (`BOT_RE.test(ua)`): unchanged — `lookupMeal(code)` then
  `rewrite('/api/share?meal=<ids>')` for the OG card (`ids` used verbatim; it is already the
  exact `?meal=` payload). Unknown code → `redirect('/', origin)`.
- **Humans**: `rewrite(new URL("/index.html", url.origin))` — serves the SPA while the browser
  URL stays `/m/<code>`. Middleware does not re-run on the rewritten target, so no loop. The
  KV lookup is no longer needed on the human path (the SPA owns it); `lookupMeal` stays, gated
  behind the bot branch.

The `"/"` homepage branch and `config.matcher` (`["/", "/m/:code*"]`) are untouched.

### 2. New `fast-food-ui/api/resolve.js`

`GET /api/resolve?code=<code>` — a Node serverless function that looks up `meal:<code>` in
Upstash Redis over REST and returns the stored ids string.

- 200 `{ ids }` on hit.
- 400 `{ error }` when `code` is missing/empty.
- 404 `{ error }` when the code is unknown.
- 405 `{ error }` for non-GET (set `Allow: GET`).
- 503 `{ error }` when the KV store is unconfigured/unreachable (client falls back to `/`).
- `Cache-Control: no-store`.

Reuses the inlined KV REST pattern from `api/shorten.js`: the `KV_URL` / `KV_TOKEN` constants
with the `UPSTASH_REDIS_REST_* || KV_REST_API_*` fallback and a `kvCommand(["GET",
"meal:"+code])` helper. Inlined again (not a shared module) to match existing precedent and
avoid an edge-runtime (middleware) ↔ Node-runtime (functions) cross-import.

### 3. `fast-food-ui/src/App.jsx` — mount rehydration effect

Extend the existing effect (currently around `App.jsx:239-263`). Factor the shared "fetch
`/items?ids=<ids>` → `setMeal` + switch to Meal Builder" step into a small local async helper
so both branches reuse it:

- **`/m/<code>` branch** (`location.pathname.match(/^\/m\/([^/]+)\/?$/)`): `GET
  /api/resolve?code=<code>`; on ok, load the meal via the shared helper and **do not**
  `replaceState` — leave `/m/<code>` in the bar. On any failure (non-ok resolve, unknown code,
  offline) → `replaceState({}, "", "/")`.
- **`?meal=<ids>` branch**: unchanged — load via the shared helper, then strip to `/` as today.

## Edge decisions

- **Dead/unknown code or KV down:** `replaceState` to `/` so a bogus link doesn't linger on an
  empty builder. Matches today's redirect-to-`/` behavior.
- **User edits the meal after opening:** leave the now-stale `/m/<code>` in the bar. It's
  cosmetic, and re-sharing mints a fresh code. No reset-on-edit (YAGNI).

## Testing

**Automated (`fast-food-ui`, Vitest + jsdom):** add to `src/App.test.jsx`:
- Set the URL via `window.history.replaceState({}, "", "/m/abc123")` before `render(<App />)`;
  mock `fetch` so `/api/resolve` → `{ ids: "200463" }` and `/items` → one item. Assert: switches
  to Meal Builder with the item, and `window.location.pathname` is still `/m/abc123`.
- Failure test: `/api/resolve` responds 404 → `window.location.pathname` becomes `/`.

These also add the first coverage of the mount rehydration path (untested today). Full gate:
`npm run lint && npm run test && npm run build`.

**Manual / live:** `middleware.js` and `api/resolve.js` run on Vercel's edge/serverless and are
not exercised by the unit suite. Vercel **preview** deploys sit behind Deployment Protection
(unauthenticated curl hits an SSO wall), so verify on the **production** alias after merge —
safe because every failure path degrades to the existing long-link/`/` behavior:
1. Mint a short link via Share, open `/m/<code>` → Meal Builder loads, address bar still shows
   `/m/<code>`; reload and copy-from-bar work.
2. `curl -A "Twitterbot" https://<prod>/m/<code>` → per-meal OG card (bot path intact).
3. Bogus `/m/zzzzzzz` → lands on `/` with an empty builder.

## Rollout

Branch `track-c-short-link-permalink` off `main`; PR with CI green; ask before merging (merge →
production deploy); live-verify on prod.
