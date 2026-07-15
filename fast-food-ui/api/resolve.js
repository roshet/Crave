// Resolves a short meal code to its ids. GET /api/resolve?code=<code> looks up meal:<code> in
// Upstash Redis and returns { ids } — the exact comma-joined, per-id URL-encoded payload the
// client stored via /api/shorten. The SPA calls this when it loads at /m/<code> (middleware
// serves the SPA in place for humans) so it can fetch the items without the URL ever changing.
// If the KV store isn't provisioned this returns 503 and the client falls back to /.

// Upstash REST creds. The Vercel Marketplace integration injects UPSTASH_*; older Vercel KV
// integrations inject KV_REST_API_*. Accept either so provisioning choice doesn't matter.
const KV_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/+$/, "");
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

// Run one Redis command over the Upstash REST API. Returns the `result` field, or throws.
async function kvCommand(command) {
  if (!KV_URL || !KV_TOKEN) throw new Error("KV not configured");
  const resp = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!resp.ok) throw new Error(`KV ${resp.status}`);
  const data = await resp.json();
  return data.result;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const code = typeof req.query?.code === "string" ? req.query.code.trim() : "";
  if (!code) return res.status(400).json({ error: "Missing 'code'." });

  try {
    const ids = await kvCommand(["GET", `meal:${code}`]);
    res.setHeader("Cache-Control", "no-store");
    if (typeof ids !== "string" || !ids) {
      return res.status(404).json({ error: "Unknown code." });
    }
    return res.status(200).json({ ids });
  } catch {
    // KV unconfigured or unreachable — client falls back to the plain homepage.
    return res.status(503).json({ error: "Link store unavailable." });
  }
}
