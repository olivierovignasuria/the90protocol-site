// The 90 Protocol — Gap Closer email capture + E1 (Follow-Through Week, day 0).
// Called by the opt-in form on /gap-closer/ AFTER the Gap Map renders.
// It (1) validates the email and required consent, (2) sends E1 ("Your Gap Map")
// echoing the action + plans the person built, and (3) persists the lead to the
// `gapcloser_leads` Blobs store, which gap-closer-drip reads for E2..E7 (one/day).
// Anyone already in `buyers` is still emailed E1 here (they asked for their map),
// but the drip scheduler suppresses buyers from the later soft offers.
// Test guard: emails ending in @example.com are captured but NOT emailed.
// MUST be a v2 export default function (Netlify Blobs requirement).

import { getStore } from "@netlify/blobs";

const SITE = "https://the90protocol.com";
const UNSUB_BASE = `${SITE}/.netlify/functions/gap-closer-unsub`;

// Shared email shell, matching the project's existing lead emails.
function wrap(inner, unsubUrl) {
  return `<!doctype html><html><body style="margin:0;background:#0b0d10;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e9edf2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#13171c;border-radius:14px;padding:32px;">
    <tr><td style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8b97a6;padding-bottom:18px;">The 90 Protocol</td></tr>
    <tr><td style="font-size:16px;line-height:1.6;color:#cdd5de;">${inner}</td></tr>
    <tr><td style="padding-top:24px;font-size:13px;line-height:1.5;color:#8b97a6;border-top:1px solid #232a31;">
      The 90 Protocol. An instrument for the first 90 days. Built by an engineer who rebuilt after the shutdown.<br>
      You are getting this because you asked for your Gap Map and the Follow-Through Week.
      <a href="${unsubUrl}" style="color:#8b97a6;">Unsubscribe in one click</a>.
    </td></tr>
  </table></td></tr></table></body></html>`;
}
const p = (t) => `<p style="margin:0 0 16px;">${t}</p>`;
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

const leadKey = (email) => `gc-${email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}.json`;
const unsubUrlFor = (email) => `${UNSUB_BASE}?e=${encodeURIComponent(email.trim().toLowerCase())}`;

// E1 (Day 1) — "Your Gap Map". Body verbatim from MOVE2_EMAIL_MAGNET_STAGED.md,
// with the person's own action + plans echoed back when available.
function e1Content(email, action, plans) {
  const unsubUrl = unsubUrlFor(email);
  let echoHtml = "";
  let echoText = "";
  if (action) {
    echoHtml += p("The action you named:")
      + `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #3a4450;color:#e9edf2;font-style:italic;">${esc(action)}</blockquote>`;
    echoText += `The action you named:\n"${action}"\n\n`;
  }
  if (Array.isArray(plans) && plans.length) {
    const items = plans.slice(0, 3).map((pl) => `<li style="margin:0 0 8px;">${esc(pl)}</li>`).join("");
    echoHtml += `<ul style="margin:0 0 16px;padding-left:20px;color:#e9edf2;">${items}</ul>`;
    echoText += plans.slice(0, 3).map((pl, i) => `Plan ${i + 1}: ${pl}`).join("\n") + "\n\n";
  }
  const body = "Here is the action you named and the three plans you built. Reply to this email with the cue you chose; writing it once more makes it stick. The whole idea: you already decided, so the moment only has to trigger, not motivate you. Tomorrow we check plan one.";
  const html = wrap(p("Hi,") + echoHtml + p(body), unsubUrl);
  const text = `Hi,\n\n${echoText}${body}\n\nThe 90 Protocol\n\nUnsubscribe in one click: ${unsubUrl}`;
  return { html, text, unsubUrl };
}

async function sendEmail(to, subject, html, text, unsubUrl) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("missing RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "content-type": "application/json", "User-Agent": "the90protocol-gapcloser/1.0" },
    body: JSON.stringify({
      from: "The 90 Protocol <hello@the90protocol.com>",
      to: [to],
      reply_to: "oliviero.vignasuria@gmail.com",
      subject, html, text,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// Notify the owner (Oliviero) on each real new lead. Never breaks the signup on failure.
async function notifyOwner(email, action, stall, e1) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const text = `New Gap Closer lead\nEmail: ${email}\nAction: ${action || "(none)"}\nStall: ${stall || "(none)"}\nE1: ${e1}\nTime: ${new Date().toISOString()}`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "content-type": "application/json", "User-Agent": "the90protocol-gapcloser/1.0" },
      body: JSON.stringify({
        from: "The 90 Protocol <hello@the90protocol.com>",
        to: ["oliviero.vignasuria@gmail.com"],
        subject: `New Gap Closer lead: ${email}`,
        text,
      }),
    });
  } catch { /* notify is best-effort, never block the signup */ }
}

export default async (req) => {
  const ok = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return ok({ ok: false, reason: "method" });

  let body = {};
  try { body = await req.json(); } catch { return ok({ ok: false, reason: "bad body" }); }

  const email = String(body.email || "").trim();
  // Validate: a real-looking address and explicit consent. No consent, no capture.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ok({ ok: false, reason: "bad email" });
  if (body.consent !== true) return ok({ ok: false, reason: "no consent" });

  const action = String(body.action || "").trim().slice(0, 400) || null;
  const stall = String(body.stall || "").trim().slice(0, 60) || null;
  const plans = Array.isArray(body.plans) ? body.plans.map((s) => String(s).slice(0, 400)).slice(0, 3) : [];

  const store = getStore({ name: "gapcloser_leads", consistency: "strong" });
  const key = leadKey(email);

  let existing = null;
  try { existing = await store.get(key, { type: "json" }); } catch { /* ignore */ }
  if (existing?.e1_sent) return ok({ ok: true, duplicate: true });

  const isTest = email.toLowerCase().endsWith("@example.com");
  let e1 = "skipped";
  if (isTest) e1 = "skipped:test";
  else {
    try {
      const c = e1Content(email, action, plans);
      await sendEmail(email, "Your Gap Map", c.html, c.text, c.unsubUrl);
      e1 = "sent";
    } catch (err) { e1 = `error: ${err.message}`; }
  }

  try {
    await store.setJSON(key, {
      email,
      action,
      stall,
      plans,
      consent: true,
      source: "gap-closer",
      test_mode: isTest,
      unsubscribed: existing?.unsubscribed === true ? true : false,
      e1_sent: e1 === "sent",
      drip_sent: existing?.drip_sent || [],
      created_at: existing?.created_at || new Date().toISOString(),
    });
  } catch (err) { console.log("gapcloser store write error", err.message); }

  if (!isTest) await notifyOwner(email, action, stall, e1);

  console.log("gap-closer signup", JSON.stringify({ email, e1, hasAction: !!action }));
  return ok({ ok: true, e1 });
};
