// Creates a short meal link. POST { ids: "<comma-joined, URL-encoded item ids>" } stores
// the ids under a random code in Upstash Redis and returns { code }; the frontend then
// shares `${origin}/m/${code}`. middleware.js resolves /m/<code> back to the ids and hands
// off to the existing ?meal= rehydration / OG flow. If the KV store isn't provisioned this
// returns 503 and the client falls back to the long ?meal= link — sharing never breaks.
import { randomBytes } from "crypto";

// Upstash REST creds. The Vercel Marketplace integration injects UPSTASH_*; older Vercel KV
// integrations inject KV_REST_API_*. Accept either so provisioning choice doesn't matter.
const KV_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/+$/, "");
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function makeCode(len = 7) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Vercel parses JSON bodies; guard against a raw/undefined body too.
  let ids = req.body && typeof req.body === "object" ? req.body.ids : undefined;
  if (typeof ids !== "string") {
    try { ids = JSON.parse(req.body || "{}").ids; } catch { ids = undefined; }
  }
  ids = typeof ids === "string" ? ids.trim() : "";

  if (!ids) return res.status(400).json({ error: "Missing 'ids'." });
  if (ids.length > 4000) return res.status(400).json({ error: "Too many ids." });
  if (ids.split(",").filter(Boolean).length > 30) {
    return res.status(400).json({ error: "Too many items." });
  }

  try {
    // SET meal:<code> ids NX; retry on the (astronomically unlikely) code collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = makeCode();
      const result = await kvCommand(["SET", `meal:${code}`, ids, "NX"]);
      if (result === "OK") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({ code });
      }
    }
    return res.status(500).json({ error: "Could not allocate a code." });
  } catch {
    // KV unconfigured or unreachable — client falls back to the long link.
    return res.status(503).json({ error: "Link store unavailable." });
  }
}
