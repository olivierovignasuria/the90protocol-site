// The 90 Protocol — Lemon Squeezy webhook
// On `order_created`: notify Telegram, persist the buyer (Netlify Blobs), send the E1 welcome via Resend.
// Security: verifies the X-Signature HMAC-SHA256 of the raw body against LEMON_WEBHOOK_SECRET.

import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const json = (status, body) => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signatureHeader), "utf8");
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

function e1Html(firstName) {
  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  return `<!doctype html><html><body style="margin:0;background:#0b0d10;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e9edf2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#13171c;border-radius:14px;padding:32px;">
    <tr><td style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8b97a6;padding-bottom:18px;">The 90 Protocol</td></tr>
    <tr><td style="font-size:21px;line-height:1.35;font-weight:700;padding-bottom:18px;">${hi}</td></tr>
    <tr><td style="font-size:16px;line-height:1.6;color:#cdd5de;">
      <p style="margin:0 0 16px;">Your kit is ready. The download link is in the receipt email from Lemon Squeezy: the workbook, the audio, and, if you added it, the scripts.</p>
      <p style="margin:0 0 16px;">Before you open any of it, do one thing today. Run the Cash Cockpit.</p>
      <p style="margin:0 0 24px;"><a href="https://the90protocol.com" style="display:inline-block;background:#e9edf2;color:#0b0d10;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;">Run the Cash Cockpit</a></p>
      <p style="margin:0 0 16px;">Turning the fear into a number is the first win. In week one, money and identity feel like one problem. They are not. The number is what separates them.</p>
      <p style="margin:0 0 16px;">When you have your zone, reply to this email with one word: Stable, Caution, or Stall. I will point you to the right starting move for where you actually are.</p>
      <p style="margin:0 0 8px;">One day at a time. That is the whole method.</p>
    </td></tr>
    <tr><td style="padding-top:24px;font-size:13px;line-height:1.5;color:#8b97a6;border-top:1px solid #232a31;margin-top:24px;">
      The 90 Protocol. An instrument for the first 90 days. Built by an engineer who rebuilt after the shutdown.
    </td></tr>
  </table></td></tr></table></body></html>`;
}

function e1Text(firstName) {
  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  return `${hi}

Your kit is ready. The download link is in the receipt email from Lemon Squeezy: the workbook, the audio, and, if you added it, the scripts.

Before you open any of it, do one thing today. Run the Cash Cockpit:
https://the90protocol.com

Turning the fear into a number is the first win. In week one, money and identity feel like one problem. They are not. The number is what separates them.

When you have your zone, reply to this email with one word: Stable, Caution, or Stall. I will point you to the right starting move for where you actually are.

One day at a time. That is the whole method.

The 90 Protocol
An instrument for the first 90 days. Built by an engineer who rebuilt after the shutdown.`;
}

async function sendE1(toEmail, firstName) {
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
      html: e1Html(firstName),
      text: e1Text(firstName),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

export default async (req, context) => {
  if (req.method === "GET") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const signature = req.headers.get("x-signature");
  if (!verifySignature(raw, signature, process.env.LEMON_WEBHOOK_SECRET)) {
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  let payload;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const event = req.headers.get("x-event-name") || payload?.meta?.event_name;
  if (event !== "order_created") {
    return new Response(JSON.stringify({ ok: true, ignored: event || "unknown" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  const a = payload?.data?.attributes || {};
  const item = a.first_order_item || {};
  const email = a.user_email || "";
  const name = (a.user_name || "").trim();
  const firstName = name ? name.split(/\s+/)[0] : "";
  const variant = item.variant_name || item.product_name || "The 90 Protocol";
  const total = a.total_formatted || "";
  const orderNo = a.order_number != null ? `#${a.order_number}` : (a.identifier || "");
  const isTest = a.test_mode ? " [TEST]" : "";

  const results = { telegram: null, blob: null, email: null };

  // 1) Notify Oliviero on Telegram (primary buyer capture)
  try {
    await notifyTelegram(
      `🍋 <b>New order — The 90 Protocol</b>${isTest}\n` +
      `👤 ${name || "(no name)"} &lt;${email}&gt;\n` +
      `📦 ${variant}${total ? ` · ${total}` : ""}\n` +
      `#️⃣ ${orderNo}`
    );
    results.telegram = "sent";
  } catch (e) { results.telegram = `error: ${e.message}`; }

  // 2) Persist the buyer (durable record beyond Telegram)
  try {
    const store = getStore({ name: "buyers", consistency: "strong" });
    const key = `${a.identifier || orderNo || Date.now()}.json`;
    await store.setJSON(key, {
      email, name, variant, total, orderNo,
      identifier: a.identifier || null,
      test_mode: !!a.test_mode,
      created_at: a.created_at || new Date().toISOString(),
      raw_status: a.status || null,
    });
    results.blob = key;
  } catch (e) { results.blob = `error: ${e.message}`; }

  // 3) Send the E1 welcome email
  try {
    if (email) { await sendE1(email, firstName); results.email = "sent"; }
    else results.email = "skipped: no email";
  } catch (e) { results.email = `error: ${e.message}`; }

  console.log("order_created handled", JSON.stringify({ orderNo, email, results }));
  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};
