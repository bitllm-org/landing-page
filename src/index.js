// The static site is uploaded as Worker assets. Only /network.json reaches
// this code; every other request is served from public/ by Cloudflare.
//
// The live map data is generated on the bootstrap machine and published at
// data.bitllm.org/network.json. Proxying it here keeps the static deploy
// independent of the data and avoids a browser CORS requirement on the origin.
const NETWORK_URL = "https://data.bitllm.org/network.json";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/network.json") {
      try {
        const upstream = await fetch(NETWORK_URL, { cf: { cacheTtl: 0 } });
        if (!upstream.ok) throw new Error("upstream " + upstream.status);
        return new Response(upstream.body, {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          },
        });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
