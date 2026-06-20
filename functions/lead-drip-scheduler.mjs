// The 90 Protocol — lead-free nurture E2..E5 (scheduled daily).
// Reads the `leads` Blobs store (written by submission-created on each form submit).
// For each lead, sends the earliest unsent step whose day threshold has passed.
// Suppresses anyone whose email also appears in `buyers` (they get the buyer track).
// E1 (day 0) is sent by submission-created. This handles E2..E5.
// Manual dry run: GET /.netlify/functions/lead-drip-scheduler?dry=1  (reports, sends nothing).

import { getStore } from "@netlify/blobs";

const SITE = "https://the90protocol.com";
const CALENDLY = "https://calendly.com/the90protocol/30min";
const BUY = "https://buy.stripe.com/3cI28kfgv5Qp07AfAZaZi07";

// step -> { afterDays, subject }
const STEPS = [
  { step: 2, afterDays: 2, subject: "The one number that lies to you." },
  { step: 3, afterDays: 4, subject: "Why the dashboard is not enough." },
  { step: 4, afterDays: 7, subject: "What the ones who got through it did differently." },
  { step: 5, afterDays: 12, subject: "Last note, and the door." },
];

function wrap(inner) {
  return `<!doctype html><html><body style="margin:0;background:#0b0d10;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e9edf2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#13171c;border-radius:14px;padding:32px;">
    <tr><td style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8b97a6;padding-bottom:18px;">The 90 Protocol</td></tr>
    <tr><td style="font-size:16px;line-height:1.6;color:#cdd5de;">${inner}</td></tr>
    <tr><td style="padding-top:24px;font-size:13px;line-height:1.5;color:#8b97a6;border-top:1px solid #232a31;">
      The 90 Protocol. An instrument for the first 90 days. Built by an engineer who rebuilt after the shutdown.
    </td></tr>
  </table></td></tr></table></body></html>`;
}
const btn = (href, label) => `<p style="margin:8px 0 24px;"><a href="${href}" style="display:inline-block;background:#e9edf2;color:#0b0d10;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;">${label}</a></p>`;
const p = (t) => `<p style="margin:0 0 16px;">${t}</p>`;
const ps = (t) => `<p style="margin:24px 0 0;font-size:14px;color:#8b97a6;">${t}</p>`;

function content(step) {
  const hi = "Hi,";
  if (step === 2) return {
    html: wrap(p(hi)
      + p("Most founders track the wrong number after a shutdown. They watch the balance. The balance lies. It tells you what you have, not how long you have.")
      + p("The number that matters is runway in weeks: cash divided by your real weekly burn, with your own salary taken out for now.")
      + p("Run it today if you have not. When you have weeks instead of a vague dread, the next decision gets smaller and clearer.")
      + btn(SITE, "Run the Cash Cockpit")
      + p("One day at a time.")),
    text: `${hi}\n\nMost founders track the wrong number after a shutdown. They watch the balance. The balance lies. It tells you what you have, not how long you have.\n\nThe number that matters is runway in weeks: cash divided by your real weekly burn, with your own salary taken out for now.\n\nRun it today if you have not. When you have weeks instead of a vague dread, the next decision gets smaller and clearer.\n\nRun the Cash Cockpit: ${SITE}\n\nOne day at a time.\n\nThe 90 Protocol` };
  if (step === 3) return {
    html: wrap(p(hi)
      + p("By now you have a number and a structure. That is real. Here is the honest part, said plainly.")
      + p("A dashboard shows you the runway. It cannot make the call under pressure. The hardest decisions in the next 90 days are judgment calls, and judgment is the one thing a workbook cannot hand you.")
      + p("That is not a flaw in the tool. It is the line where the tool ends and the work begins. Keep going with what you have. It works.")
      + ps("P.S. If you want the full kit to keep (workbook, audio, the four conversation scripts), it is $39, one payment, yours. <a href=\"" + BUY + "\" style=\"color:#cdd5de;\">Here</a>. What you already have in the browser keeps working either way.")),
    text: `${hi}\n\nBy now you have a number and a structure. That is real. Here is the honest part, said plainly.\n\nA dashboard shows you the runway. It cannot make the call under pressure. The hardest decisions in the next 90 days are judgment calls, and judgment is the one thing a workbook cannot hand you.\n\nThat is not a flaw in the tool. It is the line where the tool ends and the work begins. Keep going with what you have. It works.\n\nThe 90 Protocol\n\nP.S. If you want the full kit to keep (workbook, audio, the four conversation scripts), it is $39, one payment, yours: ${BUY}\nWhat you already have in the browser keeps working either way.` };
  if (step === 4) return {
    html: wrap(p(hi)
      + p("A pattern I keep seeing, in founders who came out the other side of a shutdown and built again.")
      + p("The ones who got back on their feet fastest did not have better spreadsheets. They got an outside read on the decision that broke them, before they made the next big one.")
      + p("The ones who stayed stuck tried to think their way out alone, with the same mind that made the calls the first time.")
      + p("A tool gives you the dashboard. A person gives you the read. If you want one honest conversation about what actually happened and what is next, that is what this is.")
      + btn(CALENDLY, "Book a conversation")
      + p("We figure out together whether it is your next step.")),
    text: `${hi}\n\nA pattern I keep seeing, in founders who came out the other side of a shutdown and built again.\n\nThe ones who got back on their feet fastest did not have better spreadsheets. They got an outside read on the decision that broke them, before they made the next big one.\n\nThe ones who stayed stuck tried to think their way out alone, with the same mind that made the calls the first time.\n\nA tool gives you the dashboard. A person gives you the read. If you want one honest conversation about what actually happened and what is next, that is what this is.\n\nBook a conversation: ${CALENDLY}\n\nWe figure out together whether it is your next step.\n\nThe 90 Protocol` };
  return {
    html: wrap(p(hi)
      + p("This is the last email in this thread. I will not keep nudging.")
      + p("You have the number, the structure, and the words. The operator is back on its feet. That was the point.")
      + p("There is a deeper level: the pattern behind the decisions that led to the collapse. A workbook does not reach it. Looking at it is a different kind of work, and it goes faster with someone who has done it.")
      + p("If you want to look, the door is open. One conversation. We decide together whether there is a next step.")
      + btn(CALENDLY, "Book the conversation")
      + p("Either way you stay on the list, for the occasional note worth your time.")),
    text: `${hi}\n\nThis is the last email in this thread. I will not keep nudging.\n\nYou have the number, the structure, and the words. The operator is back on its feet. That was the point.\n\nThere is a deeper level: the pattern behind the decisions that led to the collapse. A workbook does not reach it. Looking at it is a different kind of work, and it goes faster with someone who has done it.\n\nIf you want to look, the door is open. One conversation. We decide together whether there is a next step.\n\nBook the conversation: ${CALENDLY}\n\nEither way you stay on the list, for the occasional note worth your time.\n\nThe 90 Protocol` };
}

async function sendEmail(to, subject, html, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("missing RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "content-type": "application/json", "User-Agent": "the90protocol-leaddrip/1.0" },
    body: JSON.stringify({ from: "The 90 Protocol <hello@the90protocol.com>", to: [to], reply_to: "the90protocol@gmail.com", subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export default async (req) => {
  const params = (() => { try { return new URL(req.url).searchParams; } catch { return new URLSearchParams(); } })();
  const dry = params.get("dry") === "1";
  const leads = getStore({ name: "leads", consistency: "strong" });
  const buyers = getStore({ name: "buyers", consistency: "strong" });

  if (params.get("cleanup") === "1") {
    const deleted = [];
    try {
      const { blobs } = await leads.list();
      for (const b of (blobs || [])) {
        const r = await leads.get(b.key, { type: "json" }).catch(() => null);
        if (r?.test_mode || b.key.includes("example_com")) { await leads.delete(b.key); deleted.push(b.key); }
      }
    } catch (e) { return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 200, headers: { "content-type": "application/json" } }); }
    return new Response(JSON.stringify({ ok: true, deleted }), { status: 200, headers: { "content-type": "application/json" } });
  }

  // Build the set of buyer emails to suppress.
  const buyerEmails = new Set();
  try {
    const { blobs } = await buyers.list();
    for (const b of blobs) { const r = await buyers.get(b.key, { type: "json" }).catch(() => null); if (r?.email) buyerEmails.add(r.email.toLowerCase()); }
  } catch { /* fail open */ }

  const { blobs } = await leads.list();
  const report = [];

  for (const b of blobs) {
    let rec;
    try { rec = await leads.get(b.key, { type: "json" }); } catch { continue; }
    if (!rec || !rec.email) continue;
    if (rec.test_mode) { report.push({ key: b.key, skipped: "test_mode" }); continue; }
    if (buyerEmails.has(rec.email.toLowerCase())) { report.push({ key: b.key, skipped: "is_buyer" }); continue; }

    const created = new Date(rec.created_at || 0).getTime();
    const days = Math.floor((Date.now() - created) / 86400000);
    const sent = Array.isArray(rec.lead_drip_sent) ? rec.lead_drip_sent : [];

    const due = STEPS.filter((s) => days >= s.afterDays && !sent.includes(s.step));
    if (!due.length) { report.push({ key: b.key, days, sent, due: [] }); continue; }

    const s = due[0]; // earliest unsent due step, one per run
    if (dry) { report.push({ key: b.key, days, would_send: s.step }); continue; }
    try {
      const c = content(s.step);
      await sendEmail(rec.email, s.subject, c.html, c.text);
      rec.lead_drip_sent = [...sent, s.step];
      await leads.setJSON(b.key, rec);
      report.push({ key: b.key, days, sent_step: s.step });
    } catch (e) { report.push({ key: b.key, error: e.message }); }
  }

  console.log("lead-drip run", JSON.stringify({ dry, count: report.length, report }));
  return new Response(JSON.stringify({ ok: true, dry, report }), { status: 200, headers: { "content-type": "application/json" } });
};

export const config = { schedule: "0 16 * * *" };
