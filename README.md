# bitllm.org

Source of the BitLLM landing page, https://bitllm.org. Static files served by a Cloudflare Worker,
deployed from `main` by GitHub Actions.

The dashboard that the `bitllm` binary serves on http://127.0.0.1:7778 is **not** here. That is the
setup page and lives in [bitllm-org/bitllm](https://github.com/bitllm-org/bitllm)
(`internal/assets/ui.html`).

| path | what it is |
|---|---|
| `public/index.html` | the landing page: the live swarm figure, the node map, install commands, access rules |
| `public/world.svg` | land outlines for the node map, loaded by `index.html` |
| `public/llms.txt` | setup runbook for AI agents, served at https://bitllm.org/llms.txt |
| `public/install.sh`, `public/install.ps1` | the one-line installers served at https://bitllm.org/install.sh and `/install.ps1` |
| `src/index.js` | the Worker: serves the assets and proxies `/network.json` |
| `wrangler.jsonc` | Worker name, assets directory and the custom domains |
| `scripts/check.sh` | the check that runs before every deploy |

## Editing

```sh
python3 -m http.server -d public 8000     # static only; the map shows its empty state
npx wrangler@4 dev                        # the whole Worker, including /network.json
```

Open http://127.0.0.1:8000 or the URL Wrangler prints. Push to `main`; the `ci` workflow checks
the files and then deploys.

Keep `public/llms.txt` in step with the flags and error messages in
[bitllm-org/bitllm](https://github.com/bitllm-org/bitllm): it is the file agents follow when
setting BitLLM up.

## The live map

`public/index.html` fetches `/network.json` once a minute. The Worker proxies that path to
`https://data.bitllm.org/network.json`, which the bootstrap machine refreshes from its node's
`GET /network` once a minute (`scripts/network-json.sh` in
[bitllm-org/bitllm](https://github.com/bitllm-org/bitllm)). The proxy keeps the static deploy
independent of the data and saves the browser from needing CORS on the origin. If the data host is
down the page says that live data is not available; the rest of the site is unaffected.

See [docs/network-map.md](https://github.com/bitllm-org/bitllm/blob/main/docs/network-map.md) for
what the aggregate contains and what it deliberately does not.

## First-time Cloudflare setup

The repository is wired for a Cloudflare Worker named `bitllm-landing` on the `bitllm.org` zone.
Two things need to exist in the Cloudflare account before the first deploy works.

1. **GitHub secrets.** Add these repository secrets under Settings > Secrets and variables >
   Actions:

   | secret | value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | an API token with Workers Scripts:Edit, Zone:Workers Routes:Edit and Zone:Zone:Read on the `bitllm.org` zone |
   | `CLOUDFLARE_ACCOUNT_ID` | the account id from the Cloudflare dashboard |

2. **DNS.** The first deploy attaches `bitllm.org` and `www.bitllm.org` as Worker custom domains.
   Delete the old proxied A, AAAA or CNAME records for those two names first, or the attach fails
   with a record conflict. The Worker then creates the records it needs. `data.bitllm.org` is a
   separate host and is not touched.

To deploy by hand before the secrets exist:

```sh
npx wrangler@4 login
npx wrangler@4 deploy
```

## Retiring the old host

bitllm.org used to be a directory served by `python3 -m http.server` on the bootstrap machine,
synced from `site/` in bitllm-org/bitllm. Once the Worker is live, only `network.json` still needs
to come from that machine. Stop the old site server and its sync timer, keep whatever publishes
`data.bitllm.org`, and leave `boot.bitllm.org` alone; it is a separate tunnel.

## License

MIT, see [LICENSE](LICENSE).
