# bitllm.org

Source of the BitLLM landing page, https://bitllm.org. Static files served by a Cloudflare Worker,
deployed from `main` by GitHub Actions.

The dashboard that the `bitllm` binary serves on http://127.0.0.1:7778 is **not** here. That is the
setup page and lives in [bitllm-org/bitllm](https://github.com/bitllm-org/bitllm)
(`internal/assets/ui.html`).

| path | what it is |
|---|---|
| `public/index.html` | the landing page: live map, install commands, roles, model naming, access rules |
| `public/docs/index.html` | the architecture page: discovery, connectivity, request path, receipts, audits, privacy |
| `public/site.css` | the one dark stylesheet shared by both pages |
| `public/world.svg` | the world outline behind the live map |
| `public/favicon.svg`, `public/logo-128.png` | the mark, from [bitllm-org/branding](https://github.com/bitllm-org/branding) |
| `public/llms.txt` | setup runbook for AI agents, served at https://bitllm.org/llms.txt |
| `public/install.sh`, `public/install.ps1` | the one-line installers served at https://bitllm.org/install.sh and `/install.ps1` |
| `src/index.js` | the Worker: serves the assets and `/network.json` from KV |
| `wrangler.jsonc` | Worker name, assets directory, KV binding and custom domains |
| `scripts/check.sh` | the check that runs before every deploy |

## Live map

`GET /network.json` is answered from the `network` key in the Worker's KV namespace. An
always-on node writes that key every two minutes with
[`scripts/network-kv.sh`](https://github.com/bitllm-org/bitllm/blob/main/scripts/network-kv.sh)
from the node repository. The snapshot has counts per model and per ~156 km cell and no peer ids
or addresses. If the key is empty the page shows an empty network instead of failing.

## Editing

`main` is protected: open a pull request and let `check` pass. A merge deploys.

```sh
python3 -m http.server -d public 8000     # static preview
npx wrangler@4 dev                        # the Worker, as Cloudflare runs it
```

Open http://127.0.0.1:8000 or the URL Wrangler prints.

Keep `public/llms.txt` in step with the flags and error messages in
[bitllm-org/bitllm](https://github.com/bitllm-org/bitllm): it is the file agents follow when
setting BitLLM up.

## Cloudflare setup

The site is live as a Worker named `bitllm-landing` in the `Zjj1993` account
(`5119540a40710369f72567699613f12c`), which also holds the `bitllm.org` zone. Two zone routes
send `bitllm.org/*` and `www.bitllm.org/*` to the Worker:

```jsonc
"routes": [
  { "pattern": "bitllm.org/*", "zone_name": "bitllm.org" },
  { "pattern": "www.bitllm.org/*", "zone_name": "bitllm.org" }
]
```

The existing proxied records stay; the routes take precedence at the edge, so no DNS change is
needed. The Worker has a KV binding named `NETWORK` (namespace `7295150c7ffd436b8e5eb845089d89ce`)
and answers `/network.json` from its `network` key.

To deploy by hand:

```sh
npx wrangler@4 login
CLOUDFLARE_ACCOUNT_ID=5119540a40710369f72567699613f12c npx wrangler@4 deploy
```

The GitHub Actions deploy still needs the two repository secrets
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`); without them it logs a warning and skips.

## Retiring the old host

bitllm.org used to be a directory served by `python3 -m http.server` on the bootstrap machine,
synced from `site/` in bitllm-org/bitllm. The Worker now answers both hostnames; the old server and
the `data.bitllm.org` hostname can be retired. `boot.bitllm.org` is a separate tunnel; see
[docs/bootstrap.md](https://github.com/bitllm-org/bitllm/blob/main/docs/bootstrap.md) for retiring
it once a public seed answers.

## License

MIT, see [LICENSE](LICENSE).
