# bitllm.org

Source of the BitLLM landing page, https://bitllm.org. Static files served by a Cloudflare Worker,
deployed from `main` by GitHub Actions.

The dashboard that the `bitllm` binary serves on http://127.0.0.1:7778 is **not** here. That is the
setup page and lives in [bitllm-org/bitllm](https://github.com/bitllm-org/bitllm)
(`internal/assets/ui.html`).

| path | what it is |
|---|---|
| `public/index.html` | the landing page: the swarm figure, install commands, access rules |
| `public/llms.txt` | setup runbook for AI agents, served at https://bitllm.org/llms.txt |
| `public/install.sh`, `public/install.ps1` | the one-line installers served at https://bitllm.org/install.sh and `/install.ps1` |
| `src/index.js` | the Worker: serves the assets |
| `wrangler.jsonc` | Worker name, assets directory and the custom domains |
| `scripts/check.sh` | the check that runs before every deploy |

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

The deploy publishes a Worker named `bitllm-landing`. Until the secrets exist the deploy job logs a
warning and skips, so `main` stays green.

1. **GitHub secrets.** Add these repository secrets under Settings > Secrets and variables >
   Actions:

   | secret | value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | an API token with Workers Scripts:Edit and Zone:Workers Routes:Edit on the `bitllm.org` zone |
   | `CLOUDFLARE_ACCOUNT_ID` | the BitLLM account id from the Cloudflare dashboard |

2. **Custom domains.** `wrangler.jsonc` has no routes yet: the Worker deploys to
   `bitllm-landing.<account>.workers.dev`. After the `bitllm.org` zone moves to the BitLLM account,
   add the two custom domains there:

   ```jsonc
   "routes": [
     { "pattern": "bitllm.org", "custom_domain": true },
     { "pattern": "www.bitllm.org", "custom_domain": true }
   ]
   ```

   Attaching them before the transfer would take the live site away from the old host early. When
   they are attached, delete any old proxied A, AAAA or CNAME record for the same two names first,
   or the attach fails with a record conflict; the Worker then creates the records it needs.

To deploy by hand:

```sh
npx wrangler@4 login
npx wrangler@4 deploy
```

## Retiring the old host

bitllm.org used to be a directory served by `python3 -m http.server` on the bootstrap machine,
synced from `site/` in bitllm-org/bitllm. Once the Worker is live, that server and the
`data.bitllm.org` hostname can go. `boot.bitllm.org` is a separate tunnel; see
[docs/bootstrap.md](https://github.com/bitllm-org/bitllm/blob/main/docs/bootstrap.md) for retiring
it once a public seed answers.

## License

MIT, see [LICENSE](LICENSE).
