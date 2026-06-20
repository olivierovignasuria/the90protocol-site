// The 90 Protocol — Sentinel (scheduled daily, runs 24/7 in Netlify cloud, independent of any local machine).
// Monitors: site health, LS webhook registration (self-heals if missing = GREEN), order activity, buyer count.
// Detects the launch moment (first live, non-test order) and alerts on Telegram. Writes a status blob the
// Strategist can read. Read-only except: (a) re-register the LS webhook if it vanished, (b) Telegram digest.
// Manual test: GET /.netlify/functions/sentinel?silent=1  (computes + returns JSON, sends no Telegram).

import { getStore } from "@netlify/blobs";

const STORE_ID = "409117";
const WEBHOOK_URL = "https://the90protocol.com/webhooks/lemon";
const SITE_URL = "https://the90protocol.com";
const LS = "https://api.lemonsqueezy.com/v1";

const lsHeaders = () => ({
  "Accept": "application/vnd.api+json",
  "Content-Type": "application/vnd.api+json",
  "Authorization": `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
});

async function lsGet(path) {
  const res = await fetch(`${LS}${path}`, { headers: lsHeaders() });
  if (!res.ok) throw new Error(`LS GET ${path} -> ${res.status}`);
  return res.json();
}

async function ensureWebhook() {
  const d = await lsGet(`/webhooks?filter[store_id]=${STORE_ID}`);
  const ours = (d.data || []).find((w) => (w.attributes?.url || "").includes("/webhooks/lemon"));
  if (ours) return { state: "present", id: ours.id };
  // self-heal: re-register
  const body = { data: { type: "webhooks", attributes: { url: WEBHOOK_URL, events: ["order_created"], secret: process.env.LEMON_WEBHOOK_SECRET }, relationships: { store: { data: { type: "stores", id: STORE_ID } } } } };
  const res = await fetch(`${LS}/webhooks`, { method: "POST", headers: lsHeaders(), body: JSON.stringify(body) });
  if (!res.ok) return { state: "MISSING_and_reregister_failed", detail: await res.text() };
  const created = await res.json();
  return { state: "healed", id: created.data?.id };
}

async function orderStats() {
  const d = await lsGet(`/orders?filter[store_id]=${STORE_ID}&sort=-createdAt&page[size]=50`);
  const orders = d.data || [];
  const now = Date.now();
  let live = 0, last24h = 0;
  for (const o of orders) {
    const a = o.attributes || {};
    if (a.test_mode === false) live++;
    if (a.created_at && now - new Date(a.created_at).getTime() < 86400000) last24h++;
  }
  return { total_seen: orders.length, live, last24h };
}

async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
}

export default async (req) => {
  const silent = (() => { try { return new URL(req.url).searchParams.get("silent") === "1"; } catch { return false; } })();
  const status = { ts: new Date().toISOString(), flags: [] };

  // site health
  try {
    const r = await fetch(SITE_URL, { method: "GET" });
    status.site = r.status;
    if (r.status !== 200) status.flags.push(`SITE ${r.status}`);
  } catch (e) { status.site = `err: ${e.message}`; status.flags.push("SITE unreachable"); }

  // webhook health + self-heal
  try {
    status.webhook = await ensureWebhook();
    if (status.webhook.state === "healed") status.flags.push("webhook was MISSING, re-registered");
    if (status.webhook.state.startsWith("MISSING")) status.flags.push("webhook MISSING, re-register FAILED");
  } catch (e) { status.webhook = `err: ${e.message}`; status.flags.push("webhook check failed"); }

  // order activity
  try {
    status.orders = await orderStats();
    if (status.orders.live > 0) status.flags.push(`LIVE SALES: ${status.orders.live} real order(s)`);
  } catch (e) { status.orders = `err: ${e.message}`; }

  // buyer count
  try {
    const { blobs } = await getStore({ name: "buyers", consistency: "strong" }).list();
    status.buyers = (blobs || []).length;
  } catch (e) { status.buyers = `err: ${e.message}`; }

  // persist for the Strategist
  try { await getStore({ name: "sentinel", consistency: "strong" }).setJSON("latest.json", status); } catch {}

  // digest
  const ok = status.flags.length === 0;
  const head = ok ? "🟢 The 90 Protocol — all nominal" : "🟠 The 90 Protocol — attention";
  const msg = `${head}\n` +
    `site: ${status.site} · webhook: ${status.webhook?.state || status.webhook}\n` +
    `orders seen: ${status.orders?.total_seen ?? "?"} (live ${status.orders?.live ?? "?"}, 24h ${status.orders?.last24h ?? "?"}) · buyers: ${status.buyers}\n` +
    (status.flags.length ? `flags: ${status.flags.join(" | ")}` : "no flags");
  if (!silent) { try { await telegram(msg); status.telegram = "sent"; } catch (e) { status.telegram = `err: ${e.message}`; } }

  return new Response(JSON.stringify(status, null, 2), { status: 200, headers: { "content-type": "application/json" } });
};

export const config = { schedule: "37 7 * * *" };
