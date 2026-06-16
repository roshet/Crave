// Routing Middleware: intercepts the homepage BEFORE the filesystem/cache so we can divert
// social crawlers to the OG meta-tag function. A vercel.json `rewrites` rule can't do this:
// rewrites are a filesystem *fallback* and only fire when the path matches no static file —
// but "/" always resolves to the real index.html, so a rewrite of "/" is silently skipped.
// Middleware runs first, so it can rewrite "/" regardless. Humans (and any non-crawler) fall
// straight through to the static SPA via next() — zero change to the shipped share flow.
import { rewrite, next } from "@vercel/functions";

export const config = { matcher: "/" };

// Known link-preview crawlers (case-insensitive). Anything not matched gets the SPA + the
// baseline static OG card from index.html.
const BOT_RE =
  /facebookexternalhit|facebot|twitterbot|slackbot|slack-imgproxy|discordbot|linkedinbot|whatsapp|telegrambot|embedly|pinterest|redditbot|applebot|googlebot|bingbot|skypeuripreview|vkshare|flipboard|tumblr|bitlybot|nuzzel|mattermost|google-inspectiontool/i;

export default function middleware(request) {
  const url = new URL(request.url);
  const ua = request.headers.get("user-agent") || "";
  if (url.searchParams.has("meal") && BOT_RE.test(ua)) {
    url.pathname = "/api/share"; // query string (?meal=...) is preserved
    return rewrite(url);
  }
  return next();
}
