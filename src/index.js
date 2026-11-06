// The site is static, except for /network.json: a snapshot of one node's
// GET /network, written to KV by scripts/network-kv.sh in the node repo.
// Everything else is served from public/ by the assets binding.
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
};
