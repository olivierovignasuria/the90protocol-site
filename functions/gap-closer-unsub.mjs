// The 90 Protocol — Gap Closer one-click unsubscribe.
// Removes a lead from the Follow-Through Week drip by marking `unsubscribed:true`
// on their record in the `gapcloser_leads` Blobs store. gap-closer-drip skips
// any record with unsubscribed:true, so no further emails are sent.
// Handles both:
//   GET  /.netlify/functions/gap-closer-unsub?e=<email>   (link click → confirmation page)
//   POST /.netlify/functions/gap-closer-unsub?e=<email>   (RFC 8058 List-Unsubscribe-Post one-click)
// MUST be a v2 export default function (Netlify Blobs requirement).

import { getStore } from "@netlify/blobs";

const leadKey = (email) => `gc-${email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}.json`;

function page(title, msg) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
  <style>body{margin:0;background:#05080c;color:#dfe9f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
  .box{max-width:460px;padding:32px;text-align:center}h1{font-size:20px;margin:0 0 12px}p{color:#aeb9c9;line-height:1.6;font-size:15px}a{color:#5ad1ff}</style></head>
  <body><div class="box"><h1>${title}</h1><p>${msg}</p><p><a href="https://the90protocol.com/">Back to The 90 Protocol</a></p></div></body></html>`;
}

async function unsubscribe(email) {
  if (!email) return { ok: false, reason: "no email" };
  const store = getStore({ name: "gapcloser_leads", consistency: "strong" });
  const key = leadKey(email);
  let rec = null;
  try { rec = await store.get(key, { type: "json" }); } catch { /* ignore */ }
  if (!rec) {
    // Idempotent: write a tombstone so any future record creation keeps them off the list.
    try { await store.setJSON(key, { email: email.trim().toLowerCase(), unsubscribed: true, drip_sent: [], created_at: new Date().toISOString(), source: "unsub-tombstone" }); } catch { /* ignore */ }
    return { ok: true, alreadyGone: true };
  }
  rec.unsubscribed = true;
  rec.unsubscribed_at = new Date().toISOString();
  try { await store.setJSON(key, rec); } catch (err) { return { ok: false, reason: err.message }; }
  return { ok: true };
}

export default async (req) => {
  const url = (() => { try { return new URL(req.url); } catch { return null; } })();
  const email = url ? String(url.searchParams.get("e") || "").trim() : "";

  // RFC 8058 one-click: mail clients POST here. Respond 200, no body needed.
  if (req.method === "POST") {
    const r = await unsubscribe(email);
    return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  }

  // Link click in a browser → human-readable confirmation page.
  const r = await unsubscribe(email);
  const html = r.ok
    ? page("You are unsubscribed", "You will not get any more emails from the Follow-Through Week. The Gap Map you made stays yours to keep.")
    : page("Something went wrong", "We could not process that request. You can reply to any of our emails and we will remove you by hand.");
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};
