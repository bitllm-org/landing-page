# Plan: redesign bitllm.org to match the local dashboard

## Context

bitllm.org and the dashboard at `http://127.0.0.1:7778` look like two products. The dashboard went
black and white in `2243e51`; the site never followed, and `site.css:2-3` still claims "the same
palette". The owner wants a new landing page that is black and white, reads as an open source
project, keeps every feature and fact in far fewer words, puts the GitHub repo up front, and takes
Cursor's site as a layout reference.

**Owner decisions**
- The dashboard's current style looks very good. The landing page matches it, not the other way round.
- Every OS shows the same typefaces, on the site and in the dashboard.
- The source link and repo URL are prominent.
- The current copy is too wordy. Tighten it.

**Today's mismatch, measured in Chrome**

| | Dashboard | Landing |
|---|---|---|
| Background / ink | `#070707` / `#f0f0f0`, neutral | `#0c0e0d` / `#e7e9e5`, green-tinted |
| Accent | green `#5ddb96`, used sparingly | green `#4ade80` plus orange `#fb923c` |
| Headings | mono, 40px, bold | sans, 72px, extra bold |
| Parts | window, editor, console, numbered steps | marketing cards |

## 1. Typeface: the same on every OS

Both surfaces declare system stacks, so the font depends on the machine. The look the owner approved
is partly this machine's font config mapping those names to JetBrains Mono.

| Declared stack | This machine | macOS | Windows | Stock Linux |
|---|---|---|---|---|
| `--mono` | JetBrains Mono | SF Mono | Consolas | Liberation Mono or DejaVu |
| `--sans` | Liberation Sans | San Francisco | Segoe UI | varies |

**Decision: bundle two families and serve the same files everywhere.**
- **JetBrains Mono Regular, Bold and Italic** for headings, labels, code and the wordmark. It is already
  the brand's typeface (`branding/README.md:3`). Italic is needed for code comments (`ui.html:250`).
  Subset from upstream JetBrains/JetBrainsMono, not the patched Nerd Font installed here.
- **Arimo Regular and Bold** for prose. Liberation Sans 2.x derives from Arimo, so prose should look as it
  does here today. Arimo is used because Liberation reserves its font name, which restricts subsetting.
  Implementation compares the two side by side and reads both license files before committing; if they
  visibly differ, I stop and ask.
- **Static faces, not a variable font.** Here, weight 600 already renders as Bold and 500 as Regular,
  because only those faces are installed. Shipping the same faces keeps that, so **the dashboard should
  look unchanged on this machine.** It will change on Mac and Windows, which is the point.
- Latin subset plus the arrows and punctuation we use: an estimated 20 to 25 KB per file, measured at
  implementation. `@font-face` wins over any local copy, so everyone gets the same bytes. System stacks
  stay as a fallback because model ids can contain any character.
- Ligatures off in code and commands on both surfaces. Today `--upstream` renders as one long dash on the
  dashboard and docs page, which misreads a flag people have to type.

**Delivery**
- Site: `public/fonts/*.woff2` with `OFL.txt`, `font-display: swap`, preload the two main mono files.
  `public/_headers` has no CSP, so nothing blocks them.
- Dashboard: must stay offline, so `internal/assets/assets.go` embeds a base64 `fonts.css` and substitutes
  it into `ui.html` at a placeholder. No new route, so the localhost rules in `AGENTS.md:68-69` are
  untouched, and `ui.html` stays readable. No test loads `GET /` today, so add a small Go test that the
  substitution happened.
- Source of truth: `branding/fonts/`, with `branding/README.md:40` updated.

**Outside this:** `bitllm top` uses the terminal's font and GitHub uses its own. Letterforms and spacing
will match across OSes; each OS still rasterises text a little differently. Chinese text (only the
`中文说明` link) falls back to a system font.

## 2. Design system: the dashboard's, moved onto the site

- **Tokens:** copy `ui.html:12-27` verbatim into `public/site.css`, same names: `--bg --win --panel
  --panel-2 --line --line-2 --ink --sub --dim --green --red`. Remove `--orange` and the green-tinted greys.
- **Dark only.** The dashboard has no light theme and "black and white" fits it.
- **Page shell is the dashboard's own:** side by side, the two should read as one app. The whole page sits
  in `.window` (1080px frame, same background glow), top to bottom:
  - `.titlebar`: round lights as in the dashboard, `bitllm / home`, section links, GitHub button; sticky on
    the site because the page is long.
  - `header`: wordmark, `// tagline`, a `.net` chip with live network status, and a repo chip where the
    dashboard shows the peer id.
  - `.hero`: `// comment`, `$` h1, `.lede`, and `.flow` as the section nav (`01 network`, `02 use`...).
  - `.step` sections with `.num`, `.head-meta` and hairline rules; `.lower` two-column panels where content
    pairs up; `footer` in the dashboard's bar style.
- **Type scale:** h1 is the dashboard's `600 clamp(29px, 4vw, 40px)/1.12` mono at `-1.2px`. Section h2 about
  20 to 24px mono. Prose is sans at 14 to 15px. Labels stay 10.5px uppercase mono.
- **Reused parts:** `.editor` (tabs, gutter, copy), `.console`, `.inventory`/`.model`, `.table-wrap`, `.label`,
  `.big`, `.btn`, `.btn.line`, `.net`/`.dot`, `.tag`.
- **Green** follows `branding/README.md:35-36` only: wordmark cursor, online dot, selected model. Links become
  ink with an underline. Hero "API." goes white.
- **Contrast:** `--dim` on black is low, so real content on the site uses `--sub`; `--dim` is for decorative
  labels only.

**Port selectively, not wholesale.** These dashboard rules collide with site markup:
- Bare `th, td` (`ui.html:357-358`) would truncate the four prose tables in the docs. Scope to `.table-wrap`.
- `#access` (`:336-338`) would restyle the `#access` section and its cards. Leave it out.
- `.brand` (`:84`) stacks the `_` under the name. Use `.wordmark` for the mark.
- `.label::before`, `.num`, `.n`, `.note`, and bare `header`/`footer`/`main`: scope each one.

## 3. What to take from Cursor

The dashboard decides how everything looks. Cursor only informs order and restraint inside that frame.

| Take | Leave |
|---|---|
| Short left-aligned hero, two CTAs, the product shown immediately after | Cream palette and orange accent |
| Restrained type (their h1 measures 26px at 1440 wide; ours is 72px) | Painted wallpapers (our brand bans gradients and extras) |
| Sparse copy: short heading, a sentence or two, one link, one visual | Pill buttons (the dashboard is square) |
| Alternating text and visual rows | Testimonials and logo wall (we have none and will not invent any) |
| Dated changelog row near the end | Their fonts, assets and copy: layout reference only |
| Multi-column footer, closing CTA | |

## 4. Page structure

Every current topic stays, including each model-name and access card, in the shorter wording from section 8.

| # | Section | Content | Visual |
|---|---|---|---|
| | Titlebar + header | Links: Network, Use, Features, Docs, Releases; GitHub button; `BitLLM_`, `// tagline`, live `.net` chip, repo chip | |
| | Hero | `// open source, peer-to-peer, invite-only beta`; `$ Use open models. Not someone's API.`; lede; **Install** and **View source on GitHub**; `.flow` nav | `.editor` install box. Tabs: macOS and Linux, Windows, From source |
| | Your dashboard | "What you get at 127.0.0.1:7778 after install": the dashboard's own steps inline, not a window inside a window | A. Replaces the invented terminal mock |
| | Repo strip | Full repo URL, MIT, Go, latest release. Text-only rows. Clients: Claude Code, Cline, Continue, OpenCode, Aider. Model servers: vLLM, SGLang, llama.cpp, Ollama, LM Studio | Sits where Cursor has its logo wall |
| 01 | The network right now | Live stats, map, models table | Map (live) |
| 02 | Use it, or add a GPU | Three cards become alternating rows; commands kept | B, C, D |
| 03 | No coordinator. No database. | Four cards | E, F, G |
| 04 | Features (new) | OpenAI and Anthropic gateway, `bitllm top`, self-update, credits, `--location`, `--audit`: real features the page omits today | Compact grid |
| 05 | A name is the model, not the machine. | Three cards | H |
| 06 | Invite-only, in the BitTorrent sense. | Three rules, three caveat cards | I |
| 07 | Open source (new) | Clone, build and test commands; repo tree; contributing, license, sibling repos | Tree in an `.editor` |
| 08 | Releases (new) | Latest four releases from GitHub | Dated row |
| | Docs + closing CTA | "Everything, in one place."; install line and source link | |
| | Footer | Columns: Project, Docs, Network, Brand. All six current links kept; MIT line and repo URL | |

**Must stay:** ids `#network #use #how #models #access`; `/docs/#map`, `/docs/#serving` and the 16 docs TOC ids;
paths `/install.sh /install.ps1 /llms.txt /network.json /docs/`; map/stat ids `map-svg map-dots map-note map-time
map-models stat-nodes stat-models stat-free stat-slots`; the `0 0 360 150` viewBox.

## 5. GitHub and source surfaces

Today there is one small "Source" nav link and one in the footer.

1. **Titlebar button and header chip**, always visible: GitHub mark, `bitllm-org/bitllm`, `v0.4.6`. Shortens on
   mobile.
2. **Hero CTA:** View source on GitHub.
3. **Repo strip:** `github.com/bitllm-org/bitllm` as visible, copyable text, then MIT, Go, latest release.
4. **Open source section:** `git clone https://github.com/bitllm-org/bitllm.git`,
   `go build -o bitllm ./cmd/bitllm`, `go test -race ./...` (`AGENTS.md:15-16`); a tree from the `AGENTS.md`
   layout table linking into GitHub; links to Issues, Releases, `CONTRIBUTING.md`, `AGENTS.md`, `LICENSE`; sibling
   repos `landing-page`, `branding`, `.github`.
5. **Releases section:** real tags, titles and dates.
6. **Footer** and **dashboard footer** (new links to the repo and bitllm.org).
7. **GitHub's own Website field** is empty and the repo has no topics: set the homepage to
   `https://bitllm.org` and add topics.

**Live data:** the browser calls `api.github.com/repos/bitllm-org/bitllm` and `/releases?per_page=4` without auth
(responds 200, with CORS, 60 requests an hour per IP). Cache in `sessionStorage` inside try/catch. On failure the
version and list hide and the links remain, with no hard-coded version to go stale.

**Choices:** no star count while it is 2, because a small number reads worse than none; the button says Star on
GitHub. No contributor avatars: `AGENTS.md:77` keeps personal identity out, so we link to the contributors page.

## 6. Illustration system

Everything is drawn from dashboard parts as real HTML text, not images, so it stays crisp and uses the bundled
fonts. Motion is only the cursor blink and live dot pulse, off under reduced motion. Values below were checked
against source.

| | Drawing | Must show | Cursor lineage | How ours differs |
|---|---|---|---|---|
| A | Dashboard steps: live models from `/network.json`, working client tabs and copy, step 03 as a label | What you get | Product shown straight after the hero | The real components, real data, truly interactive |
| B | `.editor` pointing an agent at the gateway | `ANTHROPIC_BASE_URL` has no `/v1`; OpenAI base has it | Text + mock row | Real snippet |
| C | `.console` with the share command and a `bitllm top` frame | Real layout from `top.go:225-300`: PEERS, SERVING, WORK EXCHANGED, RATE, LOG, with fictional ids | Terminal block | Real format |
| D | Relay command beside a small reachability diagram | See section 13, item 1 | | |
| E | Request path | Agent, then gateway, then gossip (DHT if none), direct or relay link, then serving node and `--upstream`, tokens streaming back. Own model: answered locally, no peer, no receipt | None: Cursor sells a UI, we explain a mechanism | Monochrome line drawing |
| F | Relay to direct, two states | Caption: "If the routers do not allow it, the request stays on the relay." No success rate; nothing measures one | | |
| G | Receipt card | Fields from `receipts.go:34-50`. Client signs and sends to server; server countersigns and gossips. `credits = prompt/4 + completion`. Marks what is not verified: that the named model ran, and true token counts | | |
| H | Two hosts, one model name | Gateway tries another if one stops answering. No failover after the first byte | Model-picker mock | The name is the routing key |
| I | Invite tree | Root unlimited, member 3 invites, 10 once your nodes have served. A root can revoke, which removes everyone that account invited | | |

## 7. Live-data details

- **Map bug fixed:** `.map text { font: 600 11px }` (`site.css:136`) overrides the JS `font-size`, so labels render
  about 32px on desktop and 10px on phones. That is the giant "no location" on the live site. Set family and weight
  only, and add `vector-effect: non-scaling-stroke`.
- **Map colours:** node dots become white squares with near-black counts, matching the dashboard's square `.dot`.
  The green live dot in the map header stays. `world.svg` land fill (`#20251f`) changes to neutral grey in the file,
  since CSS cannot reach it.
- **Copy buttons:** the current JS looks for a `pre` beside the button. Inside `.editor` that silently fails or copies
  line numbers, so it targets `.snip` by name.
- **Hero uses untrusted names:** anyone can announce any model name. Render with `textContent` only, cap the rows,
  truncate long names. Moving the list into the hero makes it more visible than today's table.
- **States to handle:** no snapshot, unlocated only, clusters, stale, offline, GitHub API down.

## 8. Copy: same facts, far fewer words

**Target:** today's sections total 863 words, excluding commands. Those same sections should land near 450, with the
new sections counted separately.

**Rules**
- One sentence under a heading, two at most. Cards get a title and about 15 words.
- Say what it does. Cut the metaphors and asides ("which hat it wears", "phone book entry, not a switchboard", "the
  network is the nodes").
- Commands and drawings carry the detail; the docs page carries the rest.
- **Not shortened away:** the safety caveats stay explicit, and the three access rules keep their canonical wording,
  because `AGENTS.md:80` requires it to match everywhere.
- Plain sentences, no em dashes (`AGENTS.md:79-82`).
- Scope: the landing page. On the docs page only em dashes change. `llms.txt` is left alone.

**Draft, for reaction.** Claims that were overstated are corrected against source; see the notes.

| Where | New | Note |
|---|---|---|
| Hero lede | BitTorrent for local LLMs. Share your local model, use everyone's. Your agent talks to `127.0.0.1:7778`, and a peer answers. | Was 41 words |
| 01 Network | Updated every two minutes. Operators declare their own location. Nothing is guessed from an IP. | |
| 02 Use it | One binary. Flags decide what it does. | |
| Point your agent here | Install, run, open `127.0.0.1:7778`. Pick a model, copy the snippet, send a test message. | |
| Share a local server | Point BitLLM at vLLM, SGLang, llama.cpp, Ollama or LM Studio. Every model it lists is shared. No port forwarding. | |
| Add a public relay | A host with inbound TCP and UDP 4001 runs `--public` and serves a model. NATed nodes can then reserve on it. | **Corrected:** section 13, item 1 |
| 03 No coordinator | A seed is only first contact. After that, peers find each other. | |
| Find each other | A new node resolves a DNS seed, then finds servers through gossip and a Kademlia DHT. | Gossip first, DHT if none |
| Get through NAT | A relay carries the first bytes. Hole punching goes direct when routers allow it. Transport is encrypted. | Was "Everything is encrypted"; the server reads the prompt |
| Stream the answer | Your gateway speaks OpenAI and Anthropic, picks a free slot, queues if all are busy, and streams the tokens back. | Was "straight from the GPU", untrue when relayed |
| Count the work | Client and server both sign a receipt. It gossips to the network, so anyone can count credits. | |
| 05 Names | Two machines with one name are interchangeable. If one stops answering, the gateway tries another. | Drops "the whole failover rule" |
| Use the Hugging Face id | `Qwen/Qwen3.8-Flash-Next`, exactly as published. Hosts of the same repo match without a registry. | |
| Name the actual weights | For a quant or fine-tune, add a suffix: `...-fp4-alesha`. One name, one set of weights. | |
| Just serve it | Any stable id works, with no registration. Models you add later appear without a restart. | Not on the docs page, so kept here |
| 06 Access | No account needed to try it. Membership decides who gets a free slot first. | |
| Invites are signatures | An Ethereum account signs an invite and nodes gossip it. A root can revoke an account, which also removes everyone it invited. | Was missing that only a root can |
| The server reads the prompt | Like any inference provider. Do not send secrets. Direct peers can see your IP; use a VPN if that matters. | |
| Nothing is verified yet | A node can claim a model it does not serve. Audits are opt-in spot checks, not proof of weights. Credits have no monetary value today. | README says their worth is "not decided yet", hence "today" |
| Docs CTA | Roles, discovery, the request path, receipts, audits, failure modes and privacy. | |
| Footer | Peer-to-peer inference for open models. One binary, MIT licensed, no coordinator. | |

**Access rules, verbatim** (`README.md:354-356`, `llms.txt:153-155`):
1. An invite gets you served on any free slot. Uninvited nodes are served only when a server is idle, unless its owner
   opens it to everyone.
2. There is no daily quota by default. A server owner can set one.
3. Sharing makes you a contributor: never limited by quota, and 10 invites instead of 3 once your nodes have served.

**Install tabs**, wording from `README.md:112-122`: "macOS (Apple silicon), Linux (x86-64, arm64)" and "Windows
(PowerShell)". The current "macOS · Linux · Windows" label sits above a Unix-only command, and Intel Macs are refused.

Kept as they are, because they are already short: the h1, section headings and card titles. New sections and drawing
labels follow the same rules, and so do the page `<title>` and meta description. The landing page's copy of the
OpenAI-compatible snippet omits Cursor (section 13, item 5).

## 9. Docs page

`public/docs/index.html` shares `site.css`, so it moves in the same change: same tokens, mono headings, sans prose, new
header and footer. `.doc .note` border goes from green to ink. Keep `padding-block` on `.docs` (the mobile fix from #10).
Scroll offsets follow the new header height. All anchors stay.

## 10. Dashboard changes (bitllm repo, deliberately small)

`internal/assets/ui.html` and `assets.go`: bundled fonts, ligatures off in code, footer links to the repo and bitllm.org,
an inline favicon (it has none), updated comment at `ui.html:8-11`. Refresh the stale `docs/images/dashboard.png` (it shows
v0.3.0). Nothing else changes.

## 11. Rollout

**Merging does not deploy today, despite `landing-page/README.md:33`.** The repo has no Actions secrets, wrangler was skipped
on the last merge while the job still showed green, and the live files match `main` byte for byte, so the site is being
deployed by hand. The owner either adds `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` or keeps deploying by hand.

1. `landing-page`, branch `redesign/v2`, draft PR: `docs/plan-redesign.md` first (root `docs/` is not published), then the
   build. One merge, so both pages flip together, since they share one stylesheet. `main` requires the `check` job.
2. `branding` PR: fonts and type section. No CI.
3. `bitllm` PR: footer links and favicon. Separate `bitllm` PR: fonts, ligatures, test, screenshot (`CONTRIBUTING.md:36`, one
   change per PR). The `test` workflow runs on both, and CI will not catch a broken `ui.html`, so it is checked by hand on a
   built binary.
4. GitHub repo Website field and topics, once the new site is live.

**Implementation stops at open PRs.** The owner merges (with `--merge`, no squash), deploys, and cuts the release, which `CONTRIBUTING.md:70`
reserves for the owner. Dashboard changes reach users only after a release, then self-update; open tabs need a reload. Rollback
for the site is reverting the merge and redeploying. The repos' noreply identity is already configured.

**Critical files:** `landing-page/public/{index.html,site.css,docs/index.html,world.svg,fonts/}`, `landing-page/scripts/check.sh`,
`bitllm/internal/assets/{ui.html,assets.go,fonts.css}`, `branding/{README.md,fonts/}`.

**`check.sh` gains:** `url()` targets in CSS must exist; no em dashes in the two pages; a warning, not a failure, if `:root`
differs from the dashboard's on `main`, since that silent drift is what caused this.

## 12. Verification

- **Same typeface:** extend the Chrome probe (`CSS.getPlatformFontsForNode`) to walk every text node on the landing page, docs
  page and dashboard and assert only JetBrains Mono and Arimo, with `isCustomFont: true`. Repeat under a minimal `FONTCONFIG_FILE`
  without JetBrains fonts to simulate a stock machine. **Real macOS and Windows are not available here, so I will report those as
  not verified** and ask someone to check them.
- **Dashboard unchanged here:** before and after screenshots side by side, from a fresh build on separate ports and a temp data
  directory, so the node running on 7778 is not disturbed. Only the intended differences should show.
- **Pages read as one app:** landing and dashboard screenshots side by side at the same width.
- **Nothing lost in the cut:** a table in the PR lists every fact removed from the landing page and where it now lives on the docs
  page. A word count compares old and new. The three access rules are compared against the README text.
- **Commands:** each copy button yields the exact command; `--upstream` shows two hyphens.
- **Layout:** screenshots at 1440, 1024, 768, 390, 320 with no horizontal scroll. Docs tables are not truncated.
- **States:** `npx wrangler@4 dev` (`http.server` has no `/network.json`), covering every state in section 7.
- **Checks:** `sh scripts/check.sh`; in bitllm `gofmt -l .`, `go vet ./...`, `go test -race ./...`.
- Keyboard focus and reduced motion.

## 13. Found along the way

None of these are fixed by this plan unless stated. Items 1 and 2 were confirmed directly in code or live; the rest come from the
fact-check reading the source, not from running it.

1. **A bare `--public` relay is never heard.** `announceLoop` starts only with `--upstream` (`node.go:395-399`), `ValidAnnounce` rejects an
   empty model list (`protocol.go:63`), and relay candidates come only from announces (`node.go:942`). So the page's relay command does
   not give NATed nodes a relay unless the host also serves a model. The same claim is in the README, `docs/bootstrap.md` and
   `seed-handoff.md`. From reading the code, not a two-node run. **This plan changes only the landing page's wording and command** so the
   site is true. A code fix touches what nodes announce, so it is the owner's call.
2. **The map will look empty for now:** the snapshot has 2 nodes and `cells: []`, because neither declared `--location`. Both report v0.1.11
   and v0.2.0, older than v0.3.1, so they have no updater and will not upgrade themselves.
3. **"One-off key per job" is wrong.** It is per server, rotated every 30 days (`receipts.go:9-13`). Wrong at `README.md:336`,
   `README.zh.md:232`, `docs/index.html:182,215`.
4. **Other docs page errors:** `:64,:105` say every node announces (only serving nodes do); `:107` shows the wrong JSON key; `:111` shows a
   4-character cell (real cells have 3); `:143` is partial; `:230` omits the 30-minute update give-up.
5. **Cursor as a client:** the dashboard lists it (`ui.html:643`). Reportedly it routes requests through its own backend, which cannot reach
   `127.0.0.1`. Unverified, so the landing page omits it; the dashboard is unchanged.
6. **Rule 3 versus the code:** "never limited by quota" holds only within a 7-day window (`members.go:34-35`). The canonical text stays until
   the owner changes it everywhere.
7. **Possible 16-model limit:** `MaxAnnounceModels` is 16 and a longer list would fail `ValidAnnounce`. I did not confirm whether
   `modelNames()` caps it first. It could affect anyone sharing a server with many models.

**Not in scope:** the Go module path, `bitllm top`.
