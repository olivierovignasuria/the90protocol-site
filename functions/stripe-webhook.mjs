// The 90 Protocol — Stripe webhook (live front, alternative to Lemon Squeezy)
// On `checkout.session.completed`: notify Telegram, persist the buyer (Netlify Blobs, same
// schema the drip reads), send the E1 welcome via Resend WITH the download link (Stripe does
// not deliver files natively, so E1 carries the link itself).
// Security: verifies the Stripe-Signature header (HMAC-SHA256 of `${t}.${rawBody}`) against
// STRIPE_WEBHOOK_SECRET, with a 5-minute timestamp tolerance.

import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

// Obscure (not secret) public path where the bundles are hosted on the site.
const DL_BASE = "https://the90protocol.com/dl/eb29d419a66f6e7a4f81ed88";
const TIERS = {
  core:     { label: "Workbook + Audio",            file: "The_90_Protocol_Core.zip" },
  complete: { label: "Complete Kit (with Scripts)", file: "The_90_Protocol_Complete.zip" },
};

function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    String(header).split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  // Reject events outside the tolerance window (replay protection).
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (Number.isFinite(age) && age > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("missing Telegram config");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

function e1Html(firstName, dlUrl, tierLabel) {
  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  return `<!doctype html><html><body style="margin:0;background:#0b0d10;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e9edf2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#13171c;border-radius:14px;padding:32px;">
    <tr><td style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8b97a6;padding-bottom:18px;">The 90 Protocol</td></tr>
    <tr><td style="font-size:21px;line-height:1.35;font-weight:700;padding-bottom:18px;">${hi}</td></tr>
    <tr><td style="font-size:16px;line-height:1.6;color:#cdd5de;">
      <p style="margin:0 0 16px;">Your kit is ready. Here is your download (${tierLabel}):</p>
      <p style="margin:0 0 24px;"><a href="${dlUrl}" style="display:inline-block;background:#e9edf2;color:#0b0d10;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;">Download The 90 Protocol</a></p>
      <p style="margin:0 0 16px;">Before you open any of it, do one thing today. Run the Cash Cockpit.</p>
      <p style="margin:0 0 24px;"><a href="https://the90protocol.com" style="color:#e9edf2;font-weight:700;">Run the Cash Cockpit at the90protocol.com</a></p>
      <p style="margin:0 0 16px;">Turning the fear into a number is the first win. In week one, money and identity feel like one problem. They are not. The number is what separates them.</p>
      <p style="margin:0 0 16px;">When you have your zone, reply to this email with one word: Stable, Caution, or Stall. I will point you to the right starting move for where you actually are.</p>
      <p style="margin:0 0 8px;">One day at a time. That is the whole method.</p>
    </td></tr>
    <tr><td style="padding-top:24px;font-size:13px;line-height:1.5;color:#8b97a6;border-top:1px solid #232a31;margin-top:24px;">
      The 90 Protocol. An instrument for the first 90 days. Built by an engineer who rebuilt after the shutdown.<br>
      If the button does not work, copy this link: ${dlUrl}
    </td></tr>
  </table></td></tr></table></body></html>`;
}

function e1Text(firstName, dlUrl, tierLabel) {
  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  return `${hi}

Your kit is ready. Here is your download (${tierLabel}):
${dlUrl}

Before you open any of it, do one thing today. Run the Cash Cockpit:
https://the90protocol.com

Turning the fear into a number is the first win. In week one, money and identity feel like one problem. They are not. The number is what separates them.

When you have your zone, reply to this email with one word: Stable, Caution, or Stall. I will point you to the right starting move for where you actually are.

One day at a time. That is the whole method.

The 90 Protocol
An instrument for the first 90 days. Built by an engineer who rebuilt after the shutdown.`;
}

async function sendE1(toEmail, firstName, dlUrl, tierLabel) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("missing RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "content-type": "application/json",
      // Cloudflare in front of Resend blocks default library UAs (err 1010); set an explicit one.
      "User-Agent": "the90protocol-webhook/1.0",
    },
    body: JSON.stringify({
      from: "The 90 Protocol <hello@the90protocol.com>",
      to: [toEmail],
      reply_to: "the90protocol@gmail.com",
      subject: "Your 90 Protocol is ready. Start with the number.",
      html: e1Html(firstName, dlUrl, tierLabel),
      text: e1Text(firstName, dlUrl, tierLabel),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// Meta Conversions API: server-side Purchase event for ad optimization.
// event_id = Stripe session id, so Meta dedupes against any browser-side Purchase pixel.
const META_PIXEL_ID = "1038792388478904";

function sha256(s) {
  return crypto.createHash("sha256").update(String(s).trim().toLowerCase()).digest("hex");
}

async function notifyMetaCapi({ email, amountCents, eventId }) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) throw new Error("missing META_CAPI_TOKEN");
  const body = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: "https://the90protocol.com/",
      user_data: email ? { em: [sha256(email)] } : {},
      custom_data: { currency: "USD", value: Number((amountCents / 100).toFixed(2)) },
    }],
  };
  const res = await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CAPI ${res.status}: ${await res.text()}`);
  return res.json();
}

export default async (req) => {
  if (req.method === "GET") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!verifyStripeSignature(raw, signature, process.env.STRIPE_WEBHOOK_SECRET)) {
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  let event;
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  if (event?.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ ok: true, ignored: event?.type || "unknown" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  const s = event.data?.object || {};
  // Only fulfil paid sessions.
  if (s.payment_status && s.payment_status !== "paid") {
    return new Response(JSON.stringify({ ok: true, ignored: `unpaid:${s.payment_status}` }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  const email = s.customer_details?.email || s.customer_email || "";
  const name = (s.customer_details?.name || "").trim();
  const firstName = name ? name.split(/\s+/)[0] : "";
  const amount = Number(s.amount_total || 0);
  // amount_total is the bulletproof tier mapper; metadata is a fallback.
  const tierKey = amount === 4900 ? "complete" : (amount === 3900 ? "core" : (s.metadata?.tier || "core"));
  const tier = TIERS[tierKey] || TIERS.core;
  const dlUrl = `${DL_BASE}/${tier.file}`;
  const total = amount ? `$${(amount / 100).toFixed(2)}` : "";
  const orderNo = s.id || "";
  const isTest = s.livemode === false ? " [TEST]" : "";

  const store = getStore({ name: "buyers", consistency: "strong" });
  const blobKey = `${orderNo || Date.now()}.json`;

  // Idempotency: Stripe retries events. If we already fulfilled this session, do not resend.
  let existing = null;
  try { existing = await store.get(blobKey, { type: "json" }); } catch { /* ignore */ }
  if (existing?.e1_sent) {
    return new Response(JSON.stringify({ ok: true, duplicate: blobKey }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  const results = { telegram: null, blob: null, email: null, capi: null };

  // 1) Notify Oliviero on Telegram
  try {
    await notifyTelegram(
      `💳 <b>New order — The 90 Protocol</b> (Stripe)${isTest}\n` +
      `👤 ${name || "(no name)"} &lt;${email}&gt;\n` +
      `📦 ${tier.label}${total ? ` · ${total}` : ""}\n` +
      `#️⃣ ${orderNo}`
    );
    results.telegram = "sent";
  } catch (e) { results.telegram = `error: ${e.message}`; }

  // 2) Send the E1 welcome email (with the actual download link)
  try {
    if (email) { await sendE1(email, firstName, dlUrl, tier.label); results.email = "sent"; }
    else results.email = "skipped: no email";
  } catch (e) { results.email = `error: ${e.message}`; }

  // 3) Persist the buyer (same shape the drip-scheduler reads). e1_sent guards idempotency.
  try {
    await store.setJSON(blobKey, {
      email, name,
      variant: tier.label,
      total, orderNo,
      identifier: orderNo || null,
      source: "stripe",
      tier: tierKey,
      download_url: dlUrl,
      test_mode: s.livemode === false,
      e1_sent: results.email === "sent",
      created_at: new Date().toISOString(),
      raw_status: s.payment_status || null,
    });
    results.blob = blobKey;
  } catch (e) { results.blob = `error: ${e.message}`; }

  // 4) Meta CAPI server-side Purchase (best-effort, for ad optimization)
  try {
    await notifyMetaCapi({ email, amountCents: amount, eventId: orderNo });
    results.capi = "sent";
  } catch (e) { results.capi = `error: ${e.message}`; }

  console.log("checkout.session.completed handled", JSON.stringify({ orderNo, email, tierKey, results }));
  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};
