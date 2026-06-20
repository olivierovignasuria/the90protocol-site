// The 90 Protocol — Gap Closer "Follow-Through Week" E2..E7 (scheduled daily).
// Reads the `gapcloser_leads` Blobs store (written by gap-closer-signup on each opt-in).
// For each lead, sends the earliest unsent step whose day threshold has passed (one per run).
// E1 (day 0) is sent by gap-closer-signup; this handles E2..E7, one email per day.
// Buyers (in the `buyers` store) and unsubscribed/test records are suppressed.
// Manual dry run: GET /.netlify/functions/gap-closer-drip?dry=1  (reports, sends nothing).
// MUST be a v2 export default function (Netlify Blobs requirement).

import { getStore } from "@netlify/blobs";

const SITE = "https://the90protocol.com";
const UNSUB_BASE = `${SITE}/.netlify/functions/gap-closer-unsub`;
const unsubUrlFor = (email) => `${UNSUB_BASE}?e=${encodeURIComponent(String(email).trim().toLowerCase())}`;

// step -> { afterDays, subject }. E1 is day 0 (signup). E2..E7 run on days 1..6.
const STEPS = [
  { step: 2, afterDays: 1, subject: "Did plan one fire?" },
  { step: 3, afterDays: 2, subject: "The shrink" },
  { step: 4, afterDays: 3, subject: "The obstacle, named" },
  { step: 5, afterDays: 4, subject: "What actually moved" },
  { step: 6, afterDays: 5, subject: "One action vs the whole machine" },
  { step: 7, afterDays: 6, subject: "Where this leaves you" },
];

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

// Body text verbatim from MOVE2_EMAIL_MAGNET_STAGED.md (E2..E7).
function content(step, email) {
  const unsubUrl = unsubUrlFor(email);
  const make = (paras) => ({
    html: wrap(p("Hi,") + paras.map(p).join(""), unsubUrl),
    text: `Hi,\n\n${paras.join("\n\n")}\n\nThe 90 Protocol\n\nUnsubscribe in one click: ${unsubUrl}`,
    unsubUrl,
  });
  if (step === 2) return make([
    "Quick one. When your cue happened, did you start, yes or no? If yes, good, that is the mechanism working. If no, the cue was probably too weak or too vague. Anchor it to something you physically pass (the kettle, the front door), and run it again today.",
  ]);
  if (step === 3) return make([
    "If starting still feels too big, the fix is not more willpower, it is a smaller first step. What is the two-minute version of your action? Do only that today. Starting is the part the gap blocks; the rest tends to follow once you are moving.",
  ]);
  if (step === 4) return make([
    "You wrote down the thing most likely to derail this. Today, when it shows up, treat it as the cue itself: the obstacle appears, then you do the first step before anything else. The derailer becomes the trigger.",
  ]);
  if (step === 5) return make([
    "Five days in. Look back: did the action move at all, even once? If it did, notice that a single trigger moved something weeks of trying-harder did not. That is the gap being mechanical, not a verdict on you. (If a tool that fixed one action interests you, the 90-day version is The 90 Protocol, link at the end, no rush.)",
    `The 90-day version is here: <a href="${SITE}/" style="color:#cdd5de;">${SITE}/</a>`,
  ]);
  if (step === 6) return make([
    "A gap closer fixes one action. After a shutdown there is usually a whole operating picture to rebuild: runway, the post-mortem, your own state, the go or no-go on what is next. The 90 Protocol is a private cockpit for exactly that stretch. It is the honest next step if you want one.",
    `See it here: <a href="${SITE}/" style="color:#cdd5de;">${SITE}/</a>`,
  ]);
  // step 7
  return make([
    "Honest baseline: most second ventures do not succeed, and pretending otherwise is the myth worth leaving. What an instrument changes is whether you walk in carrying old blind spots or new guardrails. If you want the 90-day version, it is here: " + `<a href="${SITE}/" style="color:#cdd5de;">${SITE}/</a>` + " . Either way, you have the Gap Map, and that is yours to keep. Unsubscribe anytime below.",
  ]);
}

async function sendEmail(to, subject, html, text, unsubUrl) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("missing RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "content-type": "application/json", "User-Agent": "the90protocol-gcdrip/1.0" },
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

export default async (req) => {
  const params = (() => { try { return new URL(req.url).searchParams; } catch { return new URLSearchParams(); } })();
  const dry = params.get("dry") === "1";
  const store = getStore({ name: "gapcloser_leads", consistency: "strong" });
  const buyers = getStore({ name: "buyers", consistency: "strong" });

  if (params.get("cleanup") === "1") {
    const deleted = [];
    try {
      const { blobs } = await store.list();
      for (const b of (blobs || [])) {
        const r = await store.get(b.key, { type: "json" }).catch(() => null);
        if (r?.test_mode || b.key.includes("example_com")) { await store.delete(b.key); deleted.push(b.key); }
      }
    } catch (e) { return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 200, headers: { "content-type": "application/json" } }); }
    return new Response(JSON.stringify({ ok: true, deleted }), { status: 200, headers: { "content-type": "application/json" } });
  }

  // Build the set of buyer emails to suppress from the soft offers (E5..E7 reference the paid product).
  const buyerEmails = new Set();
  try {
    const { blobs } = await buyers.list();
    for (const b of blobs) { const r = await buyers.get(b.key, { type: "json" }).catch(() => null); if (r?.email) buyerEmails.add(r.email.toLowerCase()); }
  } catch { /* fail open */ }

  const { blobs } = await store.list();
  const report = [];

  for (const b of blobs) {
    let rec;
    try { rec = await store.get(b.key, { type: "json" }); } catch { continue; }
    if (!rec || !rec.email) continue;
    if (rec.test_mode) { report.push({ key: b.key, skipped: "test_mode" }); continue; }
    if (rec.unsubscribed) { report.push({ key: b.key, skipped: "unsubscribed" }); continue; }
    if (buyerEmails.has(rec.email.toLowerCase())) { report.push({ key: b.key, skipped: "is_buyer" }); continue; }

    const created = new Date(rec.created_at || 0).getTime();
    const days = Math.floor((Date.now() - created) / 86400000);
    const sent = Array.isArray(rec.drip_sent) ? rec.drip_sent : [];

    const due = STEPS.filter((s) => days >= s.afterDays && !sent.includes(s.step));
    if (!due.length) { report.push({ key: b.key, days, sent, due: [] }); continue; }

    const s = due[0]; // earliest unsent due step, one per run
    if (dry) { report.push({ key: b.key, days, would_send: s.step }); continue; }
    try {
      const c = content(s.step, rec.email);
      await sendEmail(rec.email, s.subject, c.html, c.text, c.unsubUrl);
      rec.drip_sent = [...sent, s.step];
      await store.setJSON(b.key, rec);
      report.push({ key: b.key, days, sent_step: s.step });
    } catch (e) { report.push({ key: b.key, error: e.message }); }
  }

  console.log("gap-closer-drip run", JSON.stringify({ dry, count: report.length, report }));
  return new Response(JSON.stringify({ ok: true, dry, report }), { status: 200, headers: { "content-type": "application/json" } });
};

export const config = { schedule: "0 16 * * *" };
