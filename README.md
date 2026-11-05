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
| `src/index.js` | the Worker: serves the assets and answers `/network.json` from KV |
| `wrangler.jsonc` | Worker name, assets directory, KV binding and the custom domains |
| `scripts/check.sh` | the check that runs before every deploy |

## Editing

`main` is protected: open a pull request and let `check` pass. A merge deploys.

```sh
python3 -m http.server -d public 8000     # static only; the map shows its empty state
npx wrangler@4 dev                        # the whole Worker, including /network.json
```

Open http://127.0.0.1:8000 or the URL Wrangler prints.

Keep `public/llms.txt` in step with the flags and error messages in
[bitllm-org/bitllm](https://github.com/bitllm-org/bitllm): it is the file agents follow when
setting BitLLM up.

## The live map

`public/index.html` fetches `/network.json` once a minute. The Worker answers that path from the
`NETWORK` KV namespace, so the static upload never overwrites the live data and the bootstrap
machine never accepts inbound requests. The machine runs `scripts/network-kv.sh` from
[bitllm-org/bitllm](https://github.com/bitllm-org/bitllm), which copies its node's `GET /network`
into KV every two minutes. Two minutes keeps 720 writes a day, under the KV free tier limit of
1,000. If the key is empty the Worker returns a valid empty snapshot and the page says that no
node is online.

See [docs/network-map.md](https://github.com/bitllm-org/bitllm/blob/main/docs/network-map.md) for
what the aggregate contains and what it deliberately does not.

## First-time Cloudflare setup

The repository is wired for a Cloudflare Worker named `bitllm-landing` on the `bitllm.org` zone.
Three things need to exist in the Cloudflare account before the first deploy works.

1. **KV namespace.** Create it once and put its id in `wrangler.jsonc`:

   ```sh
   npx wrangler@4 login
   npx wrangler@4 kv namespace create NETWORK
   ```

   Replace `REPLACE_WITH_KV_NAMESPACE_ID` under `kv_namespaces` with the id it prints. `NETWORK`
   is the binding name in `src/index.js`; do not rename it.

2. **GitHub secrets.** Add these repository secrets under Settings > Secrets and variables >
   Actions:

   | secret | value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | an API token with Workers Scripts:Edit, Workers KV Storage:Edit, Zone:Workers Routes:Edit and Zone:Zone:Read on the `bitllm.org` zone |
   | `CLOUDFLARE_ACCOUNT_ID` | the account id from the Cloudflare dashboard |

3. **DNS.** The first deploy attaches `bitllm.org` and `www.bitllm.org` as Worker custom domains.
   Delete the old proxied A, AAAA or CNAME records for those two names first, or the attach fails
   with a record conflict. The Worker then creates the records it needs.

The bootstrap machine also needs `CLOUDFLARE_ACCOUNT_ID` and a token with Workers KV
Storage:Edit to upload `network.json`. That token belongs on the machine, not in this repository.

To deploy by hand before the secrets exist:

```sh
npx wrangler@4 login
npx wrangler@4 deploy
```

## Retiring the old host

bitllm.org used to be a directory served by `python3 -m http.server` on the bootstrap machine,
synced from `site/` in bitllm-org/bitllm. Once the Worker is live, that server, its sync timer and
the `data.bitllm.org` hostname can all go. The machine keeps only the KV uploader.
`boot.bitllm.org` is a separate tunnel and is not affected.

## License

MIT, see [LICENSE](LICENSE).
