// The 90 Protocol — post-purchase drip E2..E5 (scheduled daily).
// Reads the `buyers` Blobs store (written by lemon-webhook), and for each real buyer
// sends the email whose day threshold has passed and was not sent yet. Test-mode orders are skipped.
// Manual dry run: GET /.netlify/functions/drip-scheduler?dry=1  (reports, sends nothing).

import { getStore } from "@netlify/blobs";

const SITE = "https://the90protocol.com";
const CALENDLY = "https://calendly.com/the90protocol/30min";

// step -> { afterDays, subject, builder }
const STEPS = [
  { step: 2, afterDays: 1, subject: "Before you rebuild, you are allowed to stop." },
  { step: 3, afterDays: 3, subject: "If you are not a founder, who are you?" },
  { step: 4, afterDays: 5, subject: "The sentence that ends the silence." },
  { step: 5, afterDays: 7, subject: "The operator is back. Now the harder question." },
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

function content(step, firstName) {
  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  if (step === 2) return {
    html: wrap(p(hi) + p("You ran on adrenaline for years. The instinct now is to sprint into the next thing. Resist it for two weeks.") + p("Two weeks of real rest is what lets you write an honest post-mortem later, instead of a panicked pivot now. The protocol builds the stop in on purpose. It is not lost time. It is the part that makes the rest work.") + btn(SITE, "Open week one") + p("One day at a time.")),
    text: `${hi}\n\nYou ran on adrenaline for years. The instinct now is to sprint into the next thing. Resist it for two weeks.\n\nTwo weeks of real rest is what lets you write an honest post-mortem later, instead of a panicked pivot now. The protocol builds the stop in on purpose. It is not lost time. It is the part that makes the rest work.\n\nOpen week one: ${SITE}\n\nOne day at a time.\n\nThe 90 Protocol` };
  if (step === 3) return {
    html: wrap(p(hi) + p("The money is the easier problem. This one is slower.") + p('For years, the answer to "so what do you do" was the company. The company is gone. The operator is not.') + p("Today, run the Operator Inventory. It puts on paper the proof that your skills outlived the thing that used them.") + btn(SITE, "Run the Operator Inventory")),
    text: `${hi}\n\nThe money is the easier problem. This one is slower.\n\nFor years, the answer to "so what do you do" was the company. The company is gone. The operator is not.\n\nToday, run the Operator Inventory. It puts on paper the proof that your skills outlived the thing that used them.\n\nRun it: ${SITE}\n\nThe 90 Protocol` };
  if (step === 4) return {
    html: wrap(p(hi) + p("The founders who talk about it openly tend to recover faster. The ones who go quiet stay stuck longest.") + p('The hard part is the first sentence. So we wrote it for you, for the four conversations you are probably avoiding: family, your network, investors, and the "so what are you doing now" at a dinner.') + btn(SITE, "Open the Scripts") + p("One honest sentence changes the week.")),
    text: `${hi}\n\nThe founders who talk about it openly tend to recover faster. The ones who go quiet stay stuck longest.\n\nThe hard part is the first sentence. So we wrote it for you, for the four conversations you are probably avoiding: family, your network, investors, and the "so what are you doing now" at a dinner.\n\nOpen the Scripts: ${SITE}\n\nOne honest sentence changes the week.\n\nThe 90 Protocol` };
  return {
    html: wrap(p(hi) + p("You have your runway number, a structure, and the words. The operator is back on its feet. That was the point of these seven days.") + p("There is a deeper level. The pattern that drove the decisions behind the collapse does not fix itself with a workbook. Looking at it is a different kind of work, and it goes faster with someone who has done it.") + p("If you want to look at that level, book a conversation. We will figure out together whether it is your next step.") + btn(CALENDLY, "Book a conversation")),
    text: `${hi}\n\nYou have your runway number, a structure, and the words. The operator is back on its feet. That was the point of these seven days.\n\nThere is a deeper level. The pattern that drove the decisions behind the collapse does not fix itself with a workbook. Looking at it is a different kind of work, and it goes faster with someone who has done it.\n\nIf you want to look at that level, book a conversation. We will figure out together whether it is your next step:\n${CALENDLY}\n\nThe 90 Protocol` };
}

async function sendEmail(to, subject, html, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("missing RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "content-type": "application/json", "User-Agent": "the90protocol-drip/1.0" },
    body: JSON.stringify({ from: "The 90 Protocol <hello@the90protocol.com>", to: [to], reply_to: "the90protocol@gmail.com", subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export default async (req) => {
  const params = (() => { try { return new URL(req.url).searchParams; } catch { return new URLSearchParams(); } })();
  const dry = params.get("dry") === "1";
  const store = getStore({ name: "buyers", consistency: "strong" });

  if (params.get("probe") === "1") {
    const probe = { ok: true };
    try { await store.setJSON("__probe.json", { t: Date.now() }); probe.write = "ok"; } catch (e) { probe.write = `err: ${e.message}`; }
    try { const r = await store.get("__probe.json", { type: "json" }); probe.readback = r ? "ok" : "null"; } catch (e) { probe.readback = `err: ${e.message}`; }
    try { const { blobs } = await store.list(); probe.list_keys = (blobs || []).map((b) => b.key); } catch (e) { probe.list = `err: ${e.message}`; }
    return new Response(JSON.stringify(probe), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (params.get("cleanup") === "1") {
    const deleted = [];
    try {
      const { blobs } = await store.list();
      for (const b of (blobs || [])) {
        if (b.key.startsWith("TEST-") || b.key.startsWith("__probe") || b.key.startsWith("DRIPTEST")) { await store.delete(b.key); deleted.push(b.key); }
      }
    } catch (e) { return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 200, headers: { "content-type": "application/json" } }); }
    return new Response(JSON.stringify({ ok: true, deleted }), { status: 200, headers: { "content-type": "application/json" } });
  }
  const { blobs } = await store.list();
  const report = [];

  for (const b of blobs) {
    let rec;
    try { rec = await store.get(b.key, { type: "json" }); } catch { continue; }
    if (!rec || !rec.email) continue;
    if (rec.test_mode) { report.push({ key: b.key, skipped: "test_mode" }); continue; }

    const created = new Date(rec.created_at || 0).getTime();
    const days = Math.floor((Date.now() - created) / 86400000);
    const sent = Array.isArray(rec.drip_sent) ? rec.drip_sent : [];
    const firstName = (rec.name || "").trim().split(/\s+/)[0] || "";

    const due = STEPS.filter((s) => days >= s.afterDays && !sent.includes(s.step));
    if (!due.length) { report.push({ key: b.key, days, sent, due: [] }); continue; }

    // send the EARLIEST unsent due step per run: keeps order (E2->E5) and never sends more than one per day
    const s = due[0];
    if (dry) { report.push({ key: b.key, days, would_send: s.step }); continue; }
    try {
      const c = content(s.step, firstName);
      await sendEmail(rec.email, s.subject, c.html, c.text);
      rec.drip_sent = [...sent, s.step];
      await store.setJSON(b.key, rec);
      report.push({ key: b.key, days, sent_step: s.step });
    } catch (e) { report.push({ key: b.key, error: e.message }); }
  }

  console.log("drip run", JSON.stringify({ dry, count: report.length, report }));
  return new Response(JSON.stringify({ ok: true, dry, report }), { status: 200, headers: { "content-type": "application/json" } });
};

export const config = { schedule: "0 15 * * *" };
