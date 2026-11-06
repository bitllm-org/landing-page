// The site is static, except for /network.json: a snapshot of one node's
// GET /network, written to KV by scripts/network-kv.sh in the node repo.
// Everything else is served from public/ by the assets binding.
const REPO = "bitllm-org/bitllm";
const WORKFLOW = "network-map.yml";
// The workflow publishes every ten minutes. Only dispatch when the snapshot
// is older than this, so a working GitHub cron never gets a second run.
const STALE_MS = 15 * 60 * 1000;
const EMPTY = JSON.stringify({
  updated: null,
  nodes: 0,
  unlocated: 0,
  cell_km: 156,
  models: [],
  cells: [],
  versions: {},
});

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/network.json") {
      const body = (await env.NETWORK.get("network")) ?? EMPTY;
      return new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          // The publisher writes every ten to fifteen minutes; a minute of
          // cache keeps the page current without turning every visitor into a
          // KV read.
          "cache-control": "public, max-age=60",
          "access-control-allow-origin": "*",
        },
      });
    }
    return env.ASSETS.fetch(request);
  },

  // The map is published by the `network-map` workflow in the node repo. A
  // young repository's GitHub cron can sit idle for a long time, so this cron
  // is the dependable trigger: it asks for a run whenever the KV snapshot has
  // gone stale. A duplicate run is harmless, the workflow serialises itself.
  async scheduled(controller, env, ctx) {
    const at = new Date().toISOString();
    const outcome = await dispatchIfStale(env);
    // One small key, one write per tick: enough to tell whether the cron runs
    // at all and what it decided. The map itself keeps its own budget.
    ctx.waitUntil(env.NETWORK.put("cron", JSON.stringify({ at, outcome })));
  },
};

// Returns what it did, for the probe the cron writes back to KV.
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
