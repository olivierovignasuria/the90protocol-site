// The 90 Protocol v2: first-party, cookieless analytics collector.
// Receives a tiny anonymous event from the cockpit beacon and appends one
// JSON line per event to Netlify Blobs, keyed by UTC date. No PII is stored:
// no IP, no full user-agent, no field contents. Only event name + route/tool id,
// the anonymous per-tab session id, a server timestamp, a coarse referer host,
// and a coarse UA family. Robust and tiny: returns 204 even on bad input.
// MUST be a v2 export default function (Netlify Blobs requirement).

import { getStore } from "@netlify/blobs";

// Allow-list of event names we accept; anything else is dropped silently.
const ALLOWED = new Set([
  "view", "tool_open", "tool_complete", "start_clicked",
  "checkout_click", "call_click", "unlock",
  // gap-closer tool (path="gap-closer"): open, built the map, opt-in, cockpit CTA
  "gc_view", "gc_build", "gc_signup", "gc_cta",
]);

// Reduce a full UA string to a coarse family. No version, no device fingerprint.
function uaFamily(ua) {
  if (!ua) return "unknown";
  const s = String(ua);
  if (/bot|crawl|spider|preview|HeadlessChrome/i.test(s)) return "bot";
  if (/Edg\//.test(s)) return "edge";
  if (/OPR\/|Opera/.test(s)) return "opera";
  if (/Firefox\//.test(s)) return "firefox";
  if (/Chrome\//.test(s)) return "chrome";
  if (/Safari\//.test(s)) return "safari";
  return "other";
}

// Keep only the host of the referer, never the full path or query (no PII).
function refererHost(ref) {
  if (!ref) return null;
  try { return new URL(ref).host || null; } catch { return null; }
}

// Cap a string so a hostile client cannot bloat a line.
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

export default async (req) => {
  // Always answer 204; analytics must never surface an error to the client.
  const noContent = () => new Response(null, { status: 204 });
  if (req.method !== "POST") return noContent();

  let body = {};
  try { body = await req.json(); } catch { return noContent(); }
  if (!body || typeof body !== "object") return noContent();

  const ev = clip(body.ev, 40);
  if (!ev || !ALLOWED.has(ev)) return noContent();

  const headers = req.headers;
  const record = {
    ev,
    path: clip(body.path, 64),
    tool: clip(body.tool, 64) || undefined,
    sid: clip(body.sid, 32),
    cts: clip(body.ts, 16) || undefined,           // client-reported time (informational)
    sts: new Date().toISOString(),                 // server-stamped time (source of truth)
    ref: refererHost(headers.get("referer") || headers.get("referrer")),
    uaf: uaFamily(headers.get("user-agent")),
  };
  // Drop undefined keys to keep lines tiny.
  Object.keys(record).forEach((k) => record[k] === undefined && delete record[k]);

  const day = record.sts.slice(0, 10);             // YYYY-MM-DD (UTC)
  const key = `events-${day}.jsonl`;
  const line = JSON.stringify(record) + "\n";

  try {
    const store = getStore({ name: "t90_analytics", consistency: "strong" });
    let prev = "";
    try { prev = (await store.get(key, { type: "text" })) || ""; } catch { prev = ""; }
    await store.set(key, prev + line);
  } catch (err) {
    // Storage hiccup must not break the beacon; just log and move on.
    console.log("t90event store error", err && err.message);
  }

  return noContent();
};
