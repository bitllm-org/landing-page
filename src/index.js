// The static site is uploaded as Worker assets. Only /network.json reaches
// this code; every other request is served from public/ by Cloudflare.
//
// An always-on node writes the map aggregate into the NETWORK KV namespace
// every two minutes (scripts/network-kv.sh in bitllm-org/bitllm).
// Until the first upload the page gets a valid empty snapshot and shows no
// nodes. Keeping the data in KV means the machine never has to accept
// inbound requests.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/network.json") {
      let body = await env.NETWORK.get("network");
      if (!body) {
        body = JSON.stringify({
          updated: new Date().toISOString(),
          nodes: 0,
          unlocated: 0,
          cell_km: 156,
          models: [],
          cells: [],
          versions: {},
        });
      }
      return new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
