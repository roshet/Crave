// Server-rendered Open Graph meta tags for a shared meal link. Social crawlers
// (facebookexternalhit, Twitterbot, Slackbot, Discordbot, ...) fetch HTML and read
// <meta property="og:*"> WITHOUT running JS, so the SPA's client-side ?meal= rehydration
// can never produce a per-meal preview. vercel.json routes only crawler requests to
// /?meal=... here; this function fetches the static index.html, swaps in per-meal OG /
// Twitter tags (og:image -> /api/og), and returns it. Humans are never routed here (they
// keep the fast static SPA path), but if one is, the page still boots and rehydrates.
const BACKEND_URL = (process.env.BACKEND_URL || "https://crave-2jtg.onrender.com").replace(/\/+$/, "");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchItems(meal) {
  if (!meal) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(`${BACKEND_URL}/items?ids=${encodeURIComponent(meal)}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;
  const rawMeal = req.query.meal;
  const meal = typeof rawMeal === "string" ? rawMeal : Array.isArray(rawMeal) ? rawMeal[0] : "";

  // Base HTML = the built static index.html. Different path than the rewrite source ("/"),
  // so there is no rewrite loop. If it can't be fetched, fall back to a minimal shell.
  let html;
  try {
    const r = await fetch(`${origin}/index.html`);
    html = await r.text();
  } catch {
    html = '<!doctype html><html lang="en"><head></head><body><div id="root"></div></body></html>';
  }

  const items = await fetchItems(meal);
  const hasMeal = items.length > 0;
  const title = hasMeal
    ? items.length > 1
      ? `${items[0].title} +${items.length - 1} more`
      : items[0].title
    : "A meal on Crave";
  const totalCals = Math.round(items.reduce((s, it) => s + (Number(it.calories) || 0), 0));
  const totalProtein = Math.round(items.reduce((s, it) => s + (Number(it.protein) || 0), 0));
  const desc = hasMeal
    ? `${items.length} item${items.length === 1 ? "" : "s"} · ${totalCals} kcal · ${totalProtein}g protein. Open in Crave to view and customize.`
    : "Build smarter fast-food meals across McDonald's, Chick-fil-A, Wendy's & Taco Bell.";
  const pageTitle = hasMeal ? `${title} · Crave` : "Crave — Smarter fast-food choices";

  const encodedMeal = encodeURIComponent(meal);
  const ogImage = `${origin}/api/og?meal=${encodedMeal}`;
  const ogUrl = `${origin}/?meal=${encodedMeal}`;

  const tags = [
    `<title>${escapeHtml(pageTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(desc)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`,
    `<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `<meta property="og:url" content="${escapeHtml(ogUrl)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(desc)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`,
  ].join("\n    ");

  // Drop the baseline <title> + og/twitter/description meta from index.html so ours win
  // (avoids duplicate tags), then inject before </head>.
  html = html
    .replace(/<title>.*?<\/title>/is, "")
    .replace(/<meta\s+(?:property|name)=["'](?:og:[^"']*|twitter:[^"']*|description)["'][^>]*\/?>/gis, "")
    .replace("</head>", `    ${tags}\n  </head>`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
