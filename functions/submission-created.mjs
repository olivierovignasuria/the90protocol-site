// The 90 Protocol — lead capture + E1 (lead-free nurture, day 0).
// Netlify EVENT-triggered function: fires automatically on every "lead" form submission.
// It (1) sends the E1 welcome that echoes the lead's own "hardest part" verbatim, and
// (2) persists the lead to the `leads` Blobs store, which lead-drip-scheduler reads for E2..E5.
// Anyone already in the `buyers` store is skipped (they are on the buyer track).
// Test guard: emails ending in @example.com are captured but NOT emailed.

import { getStore } from "@netlify/blobs";

const SITE = "https://the90protocol.com";

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
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

function e1Content(hardest) {
  const hi = "Hi,";
  const echo = hardest
    ? p("You just wrote down the hardest part, in your own words:")
      + `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #3a4450;color:#e9edf2;font-style:italic;">${esc(hardest)}</blockquote>`
      + p("Read it again. That sentence is not a complaint. It is the map. Most founders in the first 90 days cannot name the hardest part, so they fight everything at once. You named it.")
    : p("Most founders in the first 90 days fight everything at once, because they cannot name the hardest part. Naming one thing is where it starts.");
  const html = wrap(
    p(hi) + p("You just unlocked The 90 Protocol.") + echo
    + p("Here is the first move. Run the Cash Cockpit.")
    + btn(SITE, "Run the Cash Cockpit")
    + p("Turning the fear into a number is the first win. In week one, money and identity feel like one problem. They are not. The number is what separates them.")
    + p("One day at a time. That is the whole method.")
  );
  const echoText = hardest
    ? `You just wrote down the hardest part, in your own words:\n"${hardest}"\n\nRead it again. That sentence is not a complaint. It is the map. Most founders in the first 90 days cannot name the hardest part, so they fight everything at once. You named it.\n\n`
    : `Most founders in the first 90 days fight everything at once, because they cannot name the hardest part. Naming one thing is where it starts.\n\n`;
  const text = `${hi}\n\nYou just unlocked The 90 Protocol.\n\n${echoText}Here is the first move. Run the Cash Cockpit:\n${SITE}\n\nTurning the fear into a number is the first win. In week one, money and identity feel like one problem. They are not. The number is what separates them.\n\nOne day at a time. That is the whole method.\n\nThe 90 Protocol`;
  return { html, text };
}

async function sendEmail(to, subject, html, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("missing RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "content-type": "application/json", "User-Agent": "the90protocol-lead/1.0" },
    body: JSON.stringify({ from: "The 90 Protocol <hello@the90protocol.com>", to: [to], reply_to: "the90protocol@gmail.com", subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const leadKey = (email) => `lead-${email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}.json`;

export default async (req) => {
  const ok = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });
  let incoming = {};
  try { incoming = await req.json(); } catch { return ok({ ok: false, reason: "bad body" }); }
  const payload = incoming.payload || incoming || {};
  const data = payload.data || payload || {};
  const email = String(data.email || payload.email || "").trim();
  if (!email || !email.includes("@")) return ok({ ok: false, reason: "no email" });
  const hardest = String(data.hardest_part || "").trim();

  const leads = getStore({ name: "leads", consistency: "strong" });
  const buyers = getStore({ name: "buyers", consistency: "strong" });

  // Suppress people already on the buyer track.
  let isBuyer = false;
  try {
    const { blobs } = await buyers.list();
    for (const b of blobs) {
      const r = await buyers.get(b.key, { type: "json" });
      if (r?.email && r.email.toLowerCase() === email.toLowerCase()) { isBuyer = true; break; }
    }
  } catch { /* if buyers store unavailable, fail open (treat as non-buyer) */ }

  const key = leadKey(email);
  let existing = null;
  try { existing = await leads.get(key, { type: "json" }); } catch { /* ignore */ }
  if (existing?.e1_sent) return ok({ ok: true, duplicate: key });

  const isTest = email.toLowerCase().endsWith("@example.com");
  let e1 = "skipped";
  if (isBuyer) e1 = "skipped:buyer";
  else if (isTest) e1 = "skipped:test";
  else { try { const c = e1Content(hardest); await sendEmail(email, "Your own words, read back to you.", c.html, c.text); e1 = "sent"; } catch (err) { e1 = `error: ${err.message}`; } }

  try {
    await leads.setJSON(key, {
      email,
      hardest_part: hardest || null,
      pain_level: data.pain_level || null,
      runway: data.runway || null,
      source: "netlify-form",
      is_buyer: isBuyer,
      test_mode: isTest,
      e1_sent: e1 === "sent",
      lead_drip_sent: [],
      created_at: new Date().toISOString(),
    });
  } catch (err) { console.log("leads store write error", err.message); }

  console.log("lead captured", JSON.stringify({ email, e1, isBuyer, hasHardest: !!hardest }));
  return ok({ ok: true, email, e1, isBuyer });
};
