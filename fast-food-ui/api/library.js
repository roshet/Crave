// Saved-meals library sync. Move a whole saved-meals library between devices without accounts:
//   POST { library: [{ name, ids: [...] }] } → stores the library under a random code → { code }
//   GET  ?code=<code>                        → { library } for that code
// The frontend maps its localStorage saved meals to { name, ids } (ids only, re-resolved via
// /items on import so nutrition stays current — same choice as the meal short links). Stored
// under lib:<code>, separate from the meal:<code> namespace. If the KV store isn't provisioned
// both verbs return 503 and the UI reports "unavailable" while the local library stays intact.
import { randomBytes } from "crypto";

// Upstash REST creds. The Vercel Marketplace integration injects UPSTASH_*; older Vercel KV
// integrations inject KV_REST_API_*. Accept either so provisioning choice doesn't matter.
const KV_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/+$/, "");
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const MAX_MEALS = 50;
const MAX_BYTES = 40000;

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

// Accept only a well-formed library: an array of { name:string, ids:[string|number,…] }.
function normalizeLibrary(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    if (!Array.isArray(m.ids) || m.ids.length === 0) return null;
    const ids = m.ids.map((id) => String(id));
    out.push({ name: typeof m.name === "string" ? m.name : "", ids });
  }
  return out;
}

async function handlePost(req, res) {
  let library = req.body && typeof req.body === "object" ? req.body.library : undefined;
  if (library === undefined) {
    try { library = JSON.parse(req.body || "{}").library; } catch { library = undefined; }
  }
  const normalized = normalizeLibrary(library);
  if (!normalized || normalized.length === 0) {
    return res.status(400).json({ error: "Missing or invalid 'library'." });
  }
  if (normalized.length > MAX_MEALS) {
    return res.status(400).json({ error: `Too many meals (max ${MAX_MEALS}).` });
  }
  const json = JSON.stringify(normalized);
  if (json.length > MAX_BYTES) {
    return res.status(400).json({ error: "Library too large." });
  }

  try {
    // SET lib:<code> json NX; retry on the (astronomically unlikely) code collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = makeCode();
      const result = await kvCommand(["SET", `lib:${code}`, json, "NX"]);
      if (result === "OK") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({ code });
      }
    }
    return res.status(500).json({ error: "Could not allocate a code." });
  } catch {
    return res.status(503).json({ error: "Library store unavailable." });
  }
}

async function handleGet(req, res) {
  const code = typeof req.query?.code === "string" ? req.query.code.trim() : "";
  if (!code) return res.status(400).json({ error: "Missing 'code'." });

  try {
    const json = await kvCommand(["GET", `lib:${code}`]);
    res.setHeader("Cache-Control", "no-store");
    if (typeof json !== "string" || !json) {
      return res.status(404).json({ error: "Unknown code." });
    }
    let library;
    try { library = JSON.parse(json); } catch { return res.status(404).json({ error: "Unknown code." }); }
    return res.status(200).json({ library });
  } catch {
    return res.status(503).json({ error: "Library store unavailable." });
  }
}

export default async function handler(req, res) {
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "GET") return handleGet(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
