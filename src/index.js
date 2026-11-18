// A request that matches a file in public/ never reaches this code: the assets
// layer answers it, so the headers on those files live in public/_headers. This
// code answers /network.json, a snapshot of one node's GET /network that a
// scheduled job in the node repo writes to KV, and anything no file matches.
const REPO = "bitllm-org/bitllm";
const WORKFLOW = "network-map.yml";
// A published run takes about a minute. At one cron tick a minute and this
// threshold, a new snapshot lands every three minutes, which is one KV write
// per cycle and about 480 a day, well under the free tier of 1,000.
const STALE_MS = 2 * 60 * 1000;
// A workflow dispatch takes up to a minute to publish, so without this the
// next two ticks would queue runs for a snapshot that is already on its way.
// The cache is per data centre, so it is a hint; a duplicate would only cost
// one extra KV write, and the workflow serialises itself anyway.
const LOCK = "https://bitllm.org/__dispatch-lock";
const EMPTY = JSON.stringify({
  updated: null,
  nodes: 0,
  unlocated: 0,
  cell_km: 156,
  models: [],
  cells: [],
  versions: {},
});

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
};

async function network(env) {
  let body;
  try {
    body = (await env.NETWORK.get("network")) ?? EMPTY;
  } catch (err) {
    console.error("network.json: KV read failed:", err);
    // The page treats any status but 2xx as "live data unavailable" and keeps
    // what it already has.
    return new Response(
      JSON.stringify({ error: "The network snapshot is not available right now." }),
      {
        status: 503,
        headers: { ...JSON_HEADERS, "cache-control": "no-store", "retry-after": "60" },
      },
    );
  }
  // Not put in the Cache API: a response from there gets the zone's browser
  // cache time, hours, whatever it says here. KV has its own edge cache.
  return new Response(body, {
    headers: { ...JSON_HEADERS, "cache-control": "public, max-age=60" },
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/network.json") return network(env);
    return env.ASSETS.fetch(request);
  },

  // The map is published by the `network-map` workflow in the node repo. A
  // young repository's GitHub cron can sit idle for a long time, so this cron
  // is the dependable trigger: it asks for a run whenever the KV snapshot has
  // gone stale. A duplicate run is harmless, the workflow serialises itself.
  async scheduled(controller, env, ctx) {
    const outcome = await dispatchIfStale(env);
    console.log("map cron:", outcome);
    // The snapshot itself shows whether the loop works. The probe exists to
    // tell "the cron stopped running at all" apart from "publishing broke",
    // so it writes once every fifteen ticks, not every tick.
    if (new Date().getUTCMinutes() % 15 === 0) {
      ctx.waitUntil(
        env.NETWORK.put("cron", JSON.stringify({ at: new Date().toISOString(), outcome })),
      );
    }
  },
};

async function takeLock() {
  try {
    const cache = caches.default;
    if (await cache.match(LOCK)) return false;
    await cache.put(LOCK, new Response("1", { headers: { "cache-control": "max-age=150" } }));
    return true;
  } catch {
    return true;
  }
}

// Returns what it did, for the log and the probe the cron writes to KV.
async function dispatchIfStale(env) {
  let updated = 0;
  try {
    const raw = await env.NETWORK.get("network");
    if (raw) updated = Date.parse(JSON.parse(raw).updated) || 0;
  } catch {
    updated = 0;
  }
  const age = Math.round((Date.now() - updated) / 1000);
  if (Date.now() - updated < STALE_MS) return `fresh ${age}s`;
  if (!(await takeLock())) return `waiting on a run, ${age}s`;

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "bitllm-landing",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    console.error("map dispatch failed", res.status, text);
    return `failed ${res.status} ${text.slice(0, 80)}`;
  }
  return `dispatched ${age}s`;
}
