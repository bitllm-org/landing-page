const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Same colouring as the dashboard, without touching the copied text.
function hl(line) {
  if (/^\s*(#|\/\/)/.test(line)) return `<span class="cm">${esc(line)}</span>`;
  const re = /("(?:[^"\\]|\\.)*")|^(\s*)(export|curl|claude|bitllm|git|go|cd|irm)\b|\b([A-Z][A-Z0-9_]{2,})=/g;
  let out = "", last = 0, m;
  while ((m = re.exec(line))) {
    out += esc(line.slice(last, m.index));
    if (m[1]) out += `<span class="str">${esc(m[1])}</span>`;
    else if (m[3]) out += `${esc(m[2])}<span class="kw">${esc(m[3])}</span>`;
    else out += `<span class="var">${esc(m[4])}</span>=`;
    last = m.index + m[0].length;
  }
  return out + esc(line.slice(last));
}
function paint(editor, code) {
  const lines = code.split("\n");
  const gutter = editor.querySelector(".gutter");
  if (gutter) gutter.textContent = lines.map((_, i) => i + 1).join("\n");
  editor.querySelector(".snip").innerHTML = lines.map(hl).join("\n");
}
for (const s of document.querySelectorAll(".snip[data-hl]")) paint(s.closest(".editor"), s.textContent);

function tabbed(editor, tabs, active, onPick) {
  const bar = editor.querySelector(".tabs");
  const hadFocus = bar.contains(document.activeElement);
  bar.replaceChildren(...Object.keys(tabs).map(k => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = k;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", k === active);
    if (k === active) b.className = "on";
    b.onclick = () => onPick(k);
    return b;
  }));
  if (hadFocus) bar.querySelector(".on").focus();
  paint(editor, tabs[active]());
}

// Install box. Windows visitors start on the Windows tab.
(() => {
  const editor = document.getElementById("install");
  const tabs = {
    "macOS and Linux": () => "curl -fsSL https://bitllm.org/install.sh | sh\n~/.local/bin/bitllm",
    "Windows (PowerShell)": () => 'irm https://bitllm.org/install.ps1 | iex\n& "$env:LOCALAPPDATA\\bitllm\\bitllm.exe"',
    "From source": () => "git clone https://github.com/bitllm-org/bitllm.git\ncd bitllm\ngo build -o bitllm ./cmd/bitllm\n./bitllm",
  };
  const show = k => tabbed(editor, tabs, k, show);
  show(/Windows/.test(navigator.userAgent) ? "Windows (PowerShell)" : "macOS and Linux");
})();

// The dashboard's client snippets, pointed at the address a node listens on.
const clientEditor = document.getElementById("client");
const BASE = "http://127.0.0.1:7778";
const clients = {
  "Claude Code": m => `export ANTHROPIC_BASE_URL=${BASE}
export ANTHROPIC_API_KEY=bitllm
export ANTHROPIC_MODEL=${m}
export ANTHROPIC_DEFAULT_OPUS_MODEL=${m}
export ANTHROPIC_DEFAULT_SONNET_MODEL=${m}
export ANTHROPIC_DEFAULT_HAIKU_MODEL=${m}
export CLAUDE_CODE_SUBAGENT_MODEL=${m}
claude`,
  "OpenAI-compatible": m => `# Cline, Continue, OpenCode, Aider, any OpenAI client
Base URL:  ${BASE}/v1
API key:   bitllm  (any value)
Model:     ${m}`,
  "pi": m => `// ~/.pi/agent/models.json, under "providers"
"bitllm": {
  "baseUrl": "${BASE}/v1",
  "api": "openai-completions",
  "apiKey": "bitllm",
  "models": [{ "id": "${m}" }]
}`,
  "curl": m => `curl ${BASE}/v1/chat/completions \\
  -d '{"model":"${m}","messages":[{"role":"user","content":"hi"}]}'`,
};
let clientTab = "Claude Code", model = "";
function renderClient() {
  const tabs = {};
  for (const k in clients) tabs[k] = () => clients[k](model || "MODEL");
  tabbed(clientEditor, tabs, clientTab, k => { clientTab = k; renderClient(); });
}
renderClient();

// Copy buttons take the text from .snip, never the line numbers.
document.addEventListener("click", e => {
  const b = e.target.closest(".copy, .copy-url");
  if (!b) return;
  const snip = b.dataset.copy ? null : b.closest(".editor").querySelector(".snip");
  const text = b.dataset.copy || snip.textContent;
  const done = () => { b.textContent = "copied"; setTimeout(() => { b.textContent = "copy"; }, 1400); };
  const select = () => { if (!snip) return; const r = document.createRange(); r.selectNodeContents(snip); getSelection().removeAllRanges(); getSelection().addRange(r); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, select); else select();
});

// Anyone can announce any model name, and these end up in commands people
// paste. Offer only names that are safe in a shell, and only a few of them.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._\/:+@-]{0,127}$/;
const MAX_ROWS = 4;
let modelsKey = "";
function renderModels(list, emptyText = "No model is online right now.") {
  const safe = list.filter(m => SAFE_NAME.test(m.id)).slice(0, MAX_ROWS);
  const key = JSON.stringify([safe.map(m => [m.id, m.nodes]), emptyText]);
  if (key === modelsKey) return;
  modelsKey = key;
  const previous = model;
  const box = document.getElementById("model-list");
  const hadFocus = box.contains(document.activeElement);
  if (!safe.some(m => m.id === model)) model = safe.length ? safe[0].id : "";
  if (!safe.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = emptyText;
    box.replaceChildren(d);
  } else {
    box.replaceChildren(...safe.map(m => {
      const row = document.createElement("label");
      row.className = "model";
      const input = document.createElement("input");
      input.type = "radio"; input.name = "model"; input.value = m.id; input.checked = m.id === model;
      const name = document.createElement("span");
      name.className = "name"; name.textContent = m.id; name.title = m.id;
      const meta = document.createElement("span");
      meta.className = "meta"; meta.textContent = m.nodes + (m.nodes === 1 ? " node" : " nodes");
      row.append(input, name, meta);
      return row;
    }));
    if (hadFocus) box.querySelector("input:checked").focus();
  }
  if (model !== previous) renderClient();
}
document.getElementById("model-list").addEventListener("change", e => { model = e.target.value; renderClient(); });

// Live map. Reads /network.json, which the Worker answers from KV. The
// snapshot holds counts per model and per ~156 km cell, no peer ids or
// addresses. Cells close on screen merge into one square.
(() => {
  const svg = document.getElementById("map-svg"), dots = document.getElementById("map-dots");
  const note = document.getElementById("map-note"), when = document.getElementById("map-time");
  const tbody = document.getElementById("map-models");
  const net = document.getElementById("net"), netText = document.getElementById("net-text");
  const NS = "http://www.w3.org/2000/svg";
  let data = null, picked = null;

  // A GitHub workflow publishes about every twenty minutes and can start late, so
  // 15 minutes is an ordinary age and this allows for a missed run as well. The
  // key expires an hour after the last write, which then reads as no snapshot.
  const STALE_AFTER = 30 * 60 * 1000;
  const isFresh = d => {
    const t = d && d.updated ? new Date(d.updated).getTime() : NaN;
    return !isNaN(t) && Date.now() - t < STALE_AFTER;
  };

  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const square = (cls, x, y, r, label) => el("rect", { class: cls, x: x - r, y: y - r, width: 2 * r, height: 2 * r, tabindex: 0, role: "button", "aria-label": label });
  const unitPx = () => (svg.getBoundingClientRect().width || 700) / 360;
  const deg = (v, pos, neg) => Math.abs(v).toFixed(0) + "°" + (v >= 0 ? pos : neg);
  const list = models => Object.entries(models).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([m, n]) => m + (n > 1 ? " ×" + n : "")).join(", ");
  const status = (on, text) => { net.classList.toggle("on", on); netText.textContent = text; };

  function clusters(cells) {
    const reach = 26 / unitPx(), out = [];
    for (const c of [...cells].sort((a, b) => b.nodes - a.nodes)) {
      const x = c.lon + 180, y = Math.min(90 - c.lat, 148);
      const k = out.find(k => Math.hypot(k.x - x, k.y - y) < reach);
      if (!k) { out.push({ x, y, lat: c.lat, lon: c.lon, nodes: c.nodes, cells: 1, models: { ...c.models } }); continue; }
      const n = k.nodes + c.nodes;
      k.x = (k.x * k.nodes + x * c.nodes) / n; k.y = (k.y * k.nodes + y * c.nodes) / n;
      k.lat = (k.lat * k.nodes + c.lat * c.nodes) / n; k.lon = (k.lon * k.nodes + c.lon * c.nodes) / n;
      k.nodes = n; k.cells++;
      for (const m in c.models) k.models[m] = (k.models[m] || 0) + c.models[m];
    }
    return out;
  }

  function summary() {
    const d = data, models = d.models.length;
    if (!d.updated) return "No recent snapshot.";
    const count = d.nodes + (d.nodes === 1 ? " node" : " nodes") + " serving " + models + (models === 1 ? " model" : " models") +
      (d.unlocated ? ", " + d.unlocated + " without a declared location" : "") + ".";
    return isFresh(d) ? count : "From the last snapshot: " + count;
  }

  function show(what, shape) {
    for (const e of dots.querySelectorAll(".on")) e.classList.remove("on");
    if (!what || picked === what.key) { picked = null; note.textContent = summary(); return; }
    picked = what.key; shape.classList.add("on");
    note.textContent = what.text;
  }
  function pickable(shape, key, text) {
    shape.addEventListener("click", () => show({ key, text }, shape));
    shape.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show({ key, text }, shape); } });
    if (picked === key) { shape.classList.add("on"); note.textContent = text; }
  }

  function draw() {
    dots.replaceChildren();
    if (!data) return;
    const u = unitPx(), r = n => (6 + 3.2 * Math.sqrt(n)) / u, fs = 11 / u;
    for (const k of clusters(data.cells)) {
      const key = k.x.toFixed(1) + "," + k.y.toFixed(1);
      const text = "Around " + deg(k.lat, "N", "S") + " " + deg(k.lon, "E", "W") + ": " + k.nodes +
        (k.nodes === 1 ? " node" : " nodes") + (k.cells > 1 ? " in " + k.cells + " nearby cells" : "") + ". " + list(k.models) + ".";
      const c = square("c", k.x, k.y, r(k.nodes), text);
      pickable(c, key, text);
      dots.append(c);
      if (k.nodes > 1) { const t = el("text", { x: k.x, y: k.y, "font-size": fs }); t.textContent = k.nodes; dots.append(t); }
    }
    if (data.unlocated) {
      const n = data.unlocated, x = 64, y = 122;
      const text = n + (n === 1 ? " node has" : " nodes have") + " not declared a location, so they are counted here and not placed on the map.";
      const c = square("u", x, y, r(n), text);
      pickable(c, "unlocated", text);
      const t = el("text", { class: "un", x, y, "font-size": fs }); t.textContent = n;
      const l = el("text", { class: "ul", x, y: y + r(n) + fs, "font-size": fs }); l.textContent = "no location";
      dots.append(c, t, l);
    }
    if (picked && !dots.querySelector(".on")) { picked = null; note.textContent = summary(); }
  }

  const emptyText = () => data.updated ? "No model is online right now." : "No recent snapshot.";

  function table() {
    tbody.replaceChildren();
    if (!data.models.length) {
      const tr = tbody.insertRow(), td = tr.insertCell();
      td.colSpan = 3; td.textContent = emptyText();
      return;
    }
    for (const m of data.models) {
      const tr = tbody.insertRow(), name = tr.insertCell();
      name.textContent = m.id; name.title = m.id;
      const nodes = tr.insertCell(); nodes.className = "n"; nodes.textContent = m.nodes;
      const free = tr.insertCell(); free.className = "n"; free.textContent = m.free + " of " + m.max;
    }
  }

  function totals() {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    // These sit under the live label, so they show only while the snapshot is fresh.
    if (!isFresh(data)) {
      for (const id of ["stat-nodes", "stat-models", "stat-free", "stat-slots"]) set(id, "-");
      return;
    }
    set("stat-nodes", data.nodes);
    set("stat-models", data.models.length);
    // Rows count a node once per model it serves, so prefer the node-level
    // totals. Snapshots from older nodes do not have them yet.
    set("stat-free", data.free ?? data.models.reduce((a, m) => a + (m.free || 0), 0));
    set("stat-slots", data.max ?? data.models.reduce((a, m) => a + (m.max || 0), 0));
  }

  function freshness() {
    const d = data, t = d.updated ? new Date(d.updated) : null;
    const known = t && !isNaN(t), fresh = isFresh(d);
    when.textContent = known ? "// updated " + t.toISOString().slice(11, 16) + " UTC" + (fresh ? "" : ", stale") : "// no recent snapshot";
    document.getElementById("map-live").classList.toggle("off", !fresh);
    document.getElementById("models-meta").textContent = fresh ? "// online right now" : known ? "// from the last snapshot" : "// no recent snapshot";
    if (!known) status(false, "No recent snapshot");
    else if (!fresh) status(false, "Snapshot is stale");
    else status(d.nodes > 0, d.nodes + (d.nodes === 1 ? " node" : " nodes") + " serving " + d.models.length + (d.models.length === 1 ? " model" : " models"));
  }

  async function load() {
    try {
      const r = await fetch("/network.json", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      if (!Array.isArray(d.cells) || !Array.isArray(d.models)) throw new Error("bad data");
      data = d;
      totals();
      freshness();
      if (!picked) note.textContent = summary();
      draw(); table(); renderModels(d.models, emptyText());
    } catch (e) {
      if (!data) {
        note.textContent = "Live data is not available right now. Every node still answers GET /network locally.";
        when.textContent = "// offline";
        document.getElementById("models-meta").textContent = "// offline";
        status(false, "Live data unavailable");
        const tr = tbody.insertRow(0), td = tr.insertCell();
        tbody.replaceChildren(tr);
        td.colSpan = 3; td.textContent = "Live data is not available right now.";
        totals();
        renderModels([], "Live data is not available right now.");
      } else {
        // Keep the map, but the snapshot keeps ageing while reads fail.
        totals();
        freshness();
        if (!picked) note.textContent = summary();
      }
    }
  }
  load(); setInterval(load, 60000);
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
})();

// Version and releases, from GitHub. On any failure the version and the list
// stay hidden and the links still work, so nothing hard-coded goes stale.
(() => {
  const KEY = "bitllm-releases", TTL = 60 * 60 * 1000;
  function render(releases) {
    const list = releases.filter(r => !r.prerelease && !r.draft && r.tag_name).slice(0, 4);
    if (!list.length) return;
    const tag = list[0].tag_name;
    for (const e of document.querySelectorAll("[data-version]")) { e.textContent = tag; e.hidden = false; }
    for (const e of document.querySelectorAll("[data-version-link]")) { e.textContent = tag; e.href = list[0].html_url; }
    for (const e of document.querySelectorAll("[data-version-row]")) e.hidden = false;
    const box = document.getElementById("rel-list");
    box.replaceChildren(...list.map(r => {
      const a = document.createElement("a");
      a.className = "rel"; a.href = r.html_url;
      const time = document.createElement("time");
      time.textContent = (r.published_at || "").slice(0, 10);
      const b = document.createElement("b");
      b.textContent = r.tag_name;
      const title = document.createElement("span");
      title.textContent = (r.name || "").replace(/^v?[\d.]+:?\s*/, "");
      a.append(time, b, title);
      return a;
    }));
    box.hidden = false;
  }
  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(KEY)); } catch {}
  if (cached && Date.now() - cached.at < TTL && Array.isArray(cached.releases)) { render(cached.releases); return; }
  fetch("https://api.github.com/repos/bitllm-org/bitllm/releases?per_page=8")
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(releases => {
      if (!Array.isArray(releases)) return;
      const slim = releases.map(({ tag_name, name, html_url, published_at, prerelease, draft }) => ({ tag_name, name, html_url, published_at, prerelease, draft }));
      try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), releases: slim })); } catch {}
      render(slim);
    })
    .catch(() => {});
})();
