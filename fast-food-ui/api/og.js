// Dynamic Open Graph card for a shared meal. Renders a 1200x630 PNG via @vercel/og
// (Satori) on the Edge runtime. Reads the ?meal=<ids> the share link carries, fetches the
// live items from the backend, and draws a branded card. If the backend is unreachable
// (Render free tier sleeps after ~15 min), it renders a generic card rather than failing —
// a broken preview image is worse than a generic one.
//
// Elements are built with React.createElement (no JSX) so this plain .js function needs no
// JSX transform configured in a non-Next project.
import { ImageResponse } from "@vercel/og";
import { createElement as h } from "react";

export const config = { runtime: "edge" };

const BACKEND_URL = (process.env.BACKEND_URL || "https://crave-2jtg.onrender.com").replace(/\/+$/, "");

const BG = "#0f172a";
const ACCENT = "#f97316";

const div = (style, children) => h("div", { style }, children);

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

export default async function handler(request) {
  const meal = new URL(request.url).searchParams.get("meal") || "";
  const items = await fetchItems(meal);
  const hasMeal = items.length > 0;

  const title = hasMeal
    ? items.length > 1
      ? `${items[0].title} +${items.length - 1} more`
      : items[0].title
    : "A meal shared on Crave";

  const totalCals = Math.round(items.reduce((s, it) => s + (Number(it.calories) || 0), 0));
  const totalProtein = Math.round(items.reduce((s, it) => s + (Number(it.protein) || 0), 0));
  const stats = hasMeal
    ? `${items.length} item${items.length === 1 ? "" : "s"} · ${totalCals} kcal · ${totalProtein}g protein`
    : "Smarter fast-food choices across 4 major chains";

  const itemList = items.slice(0, 4).map((it, i) =>
    h("div", { key: i, style: { fontSize: 32, color: "#cbd5e1", marginTop: 8 } }, `•  ${it.title}`)
  );
  if (items.length > 4) {
    itemList.push(
      h("div", { key: "more", style: { fontSize: 30, color: "#64748b", marginTop: 8 } }, `+ ${items.length - 4} more`)
    );
  }

  const tree = div(
    {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "64px 72px",
      backgroundColor: BG,
      color: "#f8fafc",
      fontFamily: "sans-serif",
    },
    [
      h("div", { key: "brand", style: { fontSize: 46, fontWeight: 800, color: ACCENT } }, "Crave"),
      div({ display: "flex", flexDirection: "column" }, [
        h("div", { key: "t", style: { fontSize: 66, fontWeight: 800, lineHeight: 1.1 } }, title),
        h("div", { key: "s", style: { fontSize: 34, color: "#94a3b8", marginTop: 18 } }, stats),
        div({ display: "flex", flexDirection: "column", marginTop: 16 }, itemList),
      ]),
      h("div", { key: "footer", style: { fontSize: 28, color: "#475569" } }, "fast-food-ui.vercel.app"),
    ]
  );

  return new ImageResponse(tree, { width: 1200, height: 630 });
}
