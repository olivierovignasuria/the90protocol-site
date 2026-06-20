// The 90 Protocol v2: analytics read endpoint (funnel counts).
// Reads the t90_analytics Blobs store and returns aggregated counts per event
// per UTC day. Protected by ?key= which must equal env STATS_KEY.
// If STATS_KEY is unset, returns 403 (closed by default). Read-only.
// MUST be a v2 export default function (Netlify Blobs requirement).

import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  const expected = process.env.STATS_KEY;
  if (!expected) return json({ error: "stats disabled: STATS_KEY not set" }, 403);

  const url = new URL(req.url);
  const given = url.searchParams.get("key");
  if (!given || given !== expected) return json({ error: "forbidden" }, 403);

  const days = {};        // day -> { eventName -> count }
  const totals = {};      // eventName -> count
  let lines = 0, parsed = 0;

  try {
    const store = getStore({ name: "t90_analytics", consistency: "strong" });
    const { blobs } = await store.list();
    for (const b of blobs) {
      if (!/^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(b.key)) continue;
      const day = b.key.slice(7, 17);
      const text = (await store.get(b.key, { type: "text" })) || "";
      const bucket = (days[day] = days[day] || {});
      for (const raw of text.split("\n")) {
        const ln = raw.trim();
        if (!ln) continue;
        lines++;
        let rec;
        try { rec = JSON.parse(ln); } catch { continue; }
        const ev = rec && rec.ev;
        if (!ev) continue;
        parsed++;
        bucket[ev] = (bucket[ev] || 0) + 1;
        totals[ev] = (totals[ev] || 0) + 1;
      }
    }
  } catch (err) {
    return json({ error: "read failed", detail: err && err.message }, 500);
  }

  return json({
    store: "t90_analytics",
    generated_at: new Date().toISOString(),
    lines, parsed,
    totals,
    days,
  });
};
