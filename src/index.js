// The site is static. Cloudflare serves public/ on every path; this Worker
// only exists so the assets binding has an entry point.
export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
