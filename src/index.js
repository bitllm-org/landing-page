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
          // The publisher writes every two minutes; a minute of cache keeps
          // the page current without turning every visitor into a KV read.
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
    await dispatchIfStale(env);
  },
};

async function dispatchIfStale(env) {
  let updated = 0;
  try {
    const raw = await env.NETWORK.get("network");
    if (raw) updated = Date.parse(JSON.parse(raw).updated) || 0;
  } catch {
    updated = 0;
  }
  if (Date.now() - updated < STALE_MS) return;

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
  if (!res.ok) console.error("map dispatch failed", res.status, await res.text());
}
