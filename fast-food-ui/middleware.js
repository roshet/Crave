// Routing Middleware: runs BEFORE the filesystem/cache, so it can intercept paths a
// vercel.json `rewrites` rule cannot. Two jobs:
//   1. "/"        — divert social crawlers to the OG meta-tag function (feature 4). A
//                   rewrite of "/" is silently skipped (rewrites are a filesystem fallback
//                   and "/" always resolves to index.html); middleware runs first.
//   2. "/m/<code>" — resolve a short meal link (feature 12) to its ids, then hand off to
//                   the machinery that already works: crawlers → the OG function, humans →
//                   the ?meal= rehydration on the SPA. Humans (non-crawlers) at "/" fall
//                   straight through to the static SPA via next().
import { rewrite, next } from "@vercel/functions";

export const config = { matcher: ["/", "/m/:code*"] };

// Known link-preview crawlers (case-insensitive). Anything not matched gets the SPA + the
// baseline static OG card from index.html.
const BOT_RE =
  /facebookexternalhit|facebot|twitterbot|slackbot|slack-imgproxy|discordbot|linkedinbot|whatsapp|telegrambot|embedly|pinterest|redditbot|applebot|googlebot|bingbot|skypeuripreview|vkshare|flipboard|tumblr|bitlybot|nuzzel|mattermost|google-inspectiontool/i;

// Upstash REST creds (see api/shorten.js). Accept UPSTASH_* or the older KV_* names.
const KV_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/+$/, "");
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

// GET meal:<code> from Upstash over REST. Returns the stored ids string, or null on any
// miss/error (unconfigured store, network, unknown code) — callers treat null as "no meal".
async function lookupMeal(code) {
  if (!KV_URL || !KV_TOKEN || !code) return null;
  try {
    const resp = await fetch(KV_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", `meal:${code}`]),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return typeof data.result === "string" && data.result ? data.result : null;
  } catch {
    return null;
  }
}

function redirect(location, origin) {
  return new Response(null, { status: 307, headers: { Location: new URL(location, origin).toString() } });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const ua = request.headers.get("user-agent") || "";

  // Short link: /m/<code> — resolve the code, then defer to the existing flows.
  const shortMatch = url.pathname.match(/^\/m\/([^/]+)\/?$/);
  if (shortMatch) {
    const ids = await lookupMeal(decodeURIComponent(shortMatch[1]));
    if (!ids) return redirect("/", url.origin);
    // `ids` is already the exact ?meal= payload (per-id encoded, literal commas) — used
    // verbatim, exactly as the client builds the long link. Re-encoding would corrupt it.
    if (BOT_RE.test(ua)) {
      // Reuse the OG function unchanged so the short link renders a rich card in chats.
      return rewrite(new URL(`/api/share?meal=${ids}`, url.origin));
    }
    // Humans: hand to the SPA's ?meal= rehydration (it fetches items + cleans the URL).
    return redirect(`/?meal=${ids}`, url.origin);
  }

  // Homepage: divert crawlers of a ?meal= link to the OG meta-tag function.
  if (url.searchParams.has("meal") && BOT_RE.test(ua)) {
    url.pathname = "/api/share"; // query string (?meal=...) is preserved
    return rewrite(url);
  }
  return next();
}
