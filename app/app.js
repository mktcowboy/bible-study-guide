(() => {
  "use strict";

  const GROUPS = [
    ["Books", "--c-books"],
    ["People", "--c-people"],
    ["Places", "--c-places"],
    ["Events", "--c-events"],
    ["Themes", "--c-themes"],
    ["Timelines", "--c-timelines"],
    ["Quotes", "--c-quotes"],
    ["Source Text", "--c-source"],
    ["Home", "--c-home"],
  ];
  // Where each category settles in the overview layout (graph units)
  const CLUSTERS = {
    Books: [0, 0],
    People: [-560, 10],
    Events: [560, 40],
    Places: [40, -500],
    Themes: [-300, 440],
    "Source Text": [190, 430],
    Timelines: [-330, -400],
    Quotes: [-230, -440],
    Home: [0, 0],
  };

  // Visual designs register themselves on window.DESIGNS (see designs/*.js); pick with ?design=
  const DESIGNS = window.DESIGNS || {};
  const designName = new URLSearchParams(location.search).get("design") || store0("design") || "constellation";
  const D = DESIGNS[designName] || Object.values(DESIGNS)[0] || {};
  function store0(k) { try { return localStorage.getItem(k); } catch { return null; } }

  const $ = (s) => document.querySelector(s);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  const state = {
    nodes: [], links: [], byId: new Map(), adj: new Map(),
    selected: null, hover: null, hiNodes: new Set(), hiLinks: new Set(),
    hidden: new Set(["Source Text"]), local: false, labels: store.get("labels") !== "0",
    colors: {}, edge: "", edgeDim: "", edgeHi: "", text: "", bg: "", muted: "",
    noteCache: new Map(), search: null,
  };

  // ---------- Theme ----------
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    for (const [g, v] of GROUPS) state.colors[g] = css(v);
    state.edge = css("--link-edge");
    state.edgeDim = css("--link-dim");
    state.muted = css("--muted");
    state.edgeHi = css("--link-hi");
    state.text = css("--text");
    state.bg = css("--bg");
    renderLegend();
    refresh();
  }

  // ---------- Graph ----------
  let G;
  const radius = D.radius || ((n) => 1.8 + Math.sqrt(n.d) * 1.05);
  const sid = (x) => (typeof x === "object" ? x.id : x);

  // Same starting layout on every visit
  let seed = 7;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Keeps dots from overlapping (grid-bucketed, so it stays cheap)
  function collideForce() {
    let nodes = [];
    const f = () => {
      const C = 36, grid = new Map();
      for (const n of nodes) {
        const key = Math.floor(n.x / C) + "," + Math.floor(n.y / C);
        (grid.get(key) || grid.set(key, []).get(key)).push(n);
      }
      for (const n of nodes) {
        const gx = Math.floor(n.x / C), gy = Math.floor(n.y / C), rn = radius(n) + 2.5;
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++)
            for (const m of grid.get(gx + i + "," + (gy + j)) || []) {
              if (m.index <= n.index) continue;
              let dx = m.x - n.x, dy = m.y - n.y;
              const min = rn + radius(m) + 2.5;
              let d2 = dx * dx + dy * dy;
              if (d2 >= min * min) continue;
              if (!d2) { dx = rand() - 0.5; dy = rand() - 0.5; d2 = dx * dx + dy * dy; }
              const d = Math.sqrt(d2), push = ((min - d) / d) * 0.5;
              n.x -= dx * push; n.y -= dy * push;
              m.x += dx * push; m.y += dy * push;
            }
      }
    };
    f.initialize = (ns) => (nodes = ns);
    return f;
  }

  function clusterForce() {
    let nodes = [];
    const f = (alpha) => {
      if (state.local) return;
      for (const n of nodes) {
        const c = CLUSTERS[n.g] || [0, 0];
        n.vx += (c[0] - n.x) * 0.22 * alpha;
        n.vy += (c[1] - n.y) * 0.22 * alpha;
      }
    };
    f.initialize = (ns) => (nodes = ns);
    return f;
  }

  function drawNode(n, ctx, k) {
    const r = radius(n);
    const sel = state.selected;
    const focus = sel || state.hover;
    const lit = !focus || state.hiNodes.has(n.id);
    const color = state.colors[n.g] || "#999";

    const focal = n === sel || n === state.hover;
    if (D.drawNode) {
      ctx.save();
      D.drawNode(n, ctx, k, { r, color, lit, focal, focus: !!focus, theme: document.documentElement.dataset.theme });
      ctx.restore();
    } else {
      ctx.globalAlpha = lit ? 1 : 0.13;
      if (focal) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4 / k + 2, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Labels: big hubs at overview, more as you zoom in, always for the focus neighborhood
    const showLabel =
      n !== sel && n !== state.hover &&
      (state.labels && (focus ? state.hiNodes.has(n.id) && (r * k > 3.2 || state.local) : r * k > 7.5));
    if (showLabel && claimLabel(n, ctx, k, r)) drawLabel(n, ctx, k, r, lit);
    ctx.globalAlpha = 1;
  }

  // Greedy label placement on a coarse screen-space grid; skip labels that would overlap
  const labelGrid = new Map();
  function claimLabel(n, ctx, k, r) {
    const fs = Math.max(10.5, Math.min(15, 9 + r * 0.35));
    ctx.font = `500 ${fs / k}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(n.t).width * k + 6;
    const x0 = n.x * k - w / 2, y0 = (n.y + r) * k + 2, x1 = x0 + w, y1 = y0 + fs + 2;
    const C = 24, cells = [];
    for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++)
      for (let gy = Math.floor(y0 / C); gy <= Math.floor(y1 / C); gy++) {
        const key = gx + "," + gy;
        for (const b of labelGrid.get(key) || []) if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return false;
        cells.push(key);
      }
    const box = [x0, y0, x1, y1];
    for (const key of cells) (labelGrid.get(key) || labelGrid.set(key, []).get(key)).push(box);
    return true;
  }

  function drawLabel(n, ctx, k, r, lit) {
    const focal = n === state.selected || n === state.hover;
    const fs = Math.max(10.5, Math.min(15, 9 + r * 0.35)) / k;
    ctx.font = `${focal ? 600 : 500} ${fs}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3 / k;
    ctx.strokeStyle = state.bg;
    ctx.globalAlpha = lit ? (focal ? 1 : 0.85) : 0.2;
    ctx.strokeText(n.t, n.x, n.y + r + 2 / k);
    ctx.fillStyle = state.text;
    ctx.fillText(n.t, n.x, n.y + r + 2 / k);
  }

  function initGraph() {
    const el = $("#graph");
    G = new ForceGraph(el)
      .backgroundColor("rgba(0,0,0,0)")
      .nodeId("id")
      .nodeLabel(() => "")
      .nodeCanvasObject(drawNode)
      .nodePointerAreaPaint((n, color, ctx) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius(n) + 2, 0, 2 * Math.PI);
        ctx.fill();
      })
      .linkColor((l) => (state.hiLinks.has(l) ? state.edgeHi : state.selected || state.hover ? state.edgeDim : state.edge))
      .linkWidth((l) => (state.hiLinks.has(l) ? 1.3 : 0.5))
      .d3VelocityDecay(0.38)
      .warmupTicks(160)
      .cooldownTime(4000)
      .onNodeHover((n) => {
        state.hover = n || null;
        el.style.cursor = n ? "pointer" : "";
        if (!state.selected) highlight(n);
        else refresh();
      })
      .onNodeClick((n) => go(n.id))
      .onBackgroundClick(() => { if (state.selected) go(""); })
      .onRenderFramePre((ctx, k) => {
        labelGrid.clear();
        if (D.drawBackground) { ctx.save(); D.drawBackground(ctx, k, designApi()); ctx.restore(); }
        if (D.clusterLabels !== false) drawClusterLabels(ctx, k);
      })
      .onRenderFramePost((ctx, k) => {
        for (const n of [state.selected, state.hover]) {
          if (n && n.x != null && inGraph.has(n.id)) {
            drawLabel(n, ctx, k, radius(n), true);
            ctx.globalAlpha = 1;
          }
        }
      })
      .onEngineStop(() => { if (state.pendingFit) { state.pendingFit = false; fitFocus(); } });

    G.d3Force("charge").strength(-26).distanceMax(150);
    // Links inside a category hold tight; cross-category links barely pull, so islands stay distinct
    G.d3Force("link")
      .distance((l) => (l.source.g === l.target.g ? 26 : 60))
      .strength((l) => {
        const w = 1 / Math.sqrt(Math.min(state.adj.get(l.source.id).size, state.adj.get(l.target.id).size));
        return state.local ? 0.7 * w : l.source.g === l.target.g ? 0.45 * w : 0.035 * w;
      });
    G.d3Force("cluster", clusterForce());
    G.d3Force("collide", collideForce());

    if (D.drawLink) {
      G.linkCanvasObjectMode(() => "replace").linkCanvasObject((l, ctx, k) => {
        if (l.source.x == null) return;
        const hi = state.hiLinks.has(l);
        ctx.save();
        D.drawLink(l, ctx, k, {
          hi, dim: !hi && !!(state.selected || state.hover),
          color: hi ? state.edgeHi : state.edge,
          sourceColor: state.colors[l.source.g], targetColor: state.colors[l.target.g],
          theme: document.documentElement.dataset.theme,
        });
        ctx.restore();
      });
    }

    const size = () => G.width(innerWidth).height(innerHeight);
    addEventListener("resize", size);
    size();
  }

  function designApi() {
    return {
      G, nodes: state.nodes, links: state.links, adj: state.adj, byId: state.byId,
      colors: state.colors, rand, radius, CLUSTERS, state,
      theme: document.documentElement.dataset.theme,
      graphNodes: () => G.graphData().nodes,
    };
  }

  const inGraph = new Set();
  function syncData() {
    const keep = (n) => n.g !== "Home" && !state.hidden.has(n.g) && (!state.localSet || state.localSet.has(n.id));
    const nodes = state.nodes.filter(keep);
    inGraph.clear();
    for (const n of nodes) inGraph.add(n.id);
    const links = state.links.filter((l) => inGraph.has(sid(l.source)) && inGraph.has(sid(l.target)));
    // Resolve ends to node objects ourselves: designs with a static layout switch the link force off
    for (const l of links) { l.source = state.byId.get(sid(l.source)); l.target = state.byId.get(sid(l.target)); }
    G.graphData({ nodes, links });
  }

  // Faint category names over each island at overview zoom
  function drawClusterLabels(ctx, k) {
    if (state.local || !state.labels) return;
    const a = Math.max(0, Math.min(1, (1.25 - k) / 0.5));
    if (!a) return;
    const box = {};
    for (const n of G.graphData().nodes) {
      const b = box[n.g] || (box[n.g] = { x: 0, c: 0, y0: Infinity });
      b.x += n.x; b.c++; b.y0 = Math.min(b.y0, n.y);
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `600 ${12 / k}px Inter, system-ui, sans-serif`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${2.4 / k}px`;
    for (const [g, b] of Object.entries(box)) {
      if (b.c < 4) continue;
      ctx.globalAlpha = 0.75 * a * (state.selected || state.hover ? 0.35 : 1);
      ctx.fillStyle = state.colors[g];
      ctx.fillText(g.toUpperCase(), b.x / b.c, b.y0 - 14 / k);
    }
    ctx.restore();
  }

  function highlight(n) {
    state.hiNodes.clear();
    state.hiLinks.clear();
    if (n && inGraph.has(n.id)) {
      state.hiNodes.add(n.id);
      for (const l of state.links) {
        if (l.source === n || l.target === n) {
          state.hiLinks.add(l);
          state.hiNodes.add(l.source.id);
          state.hiNodes.add(l.target.id);
        }
      }
    }
    refresh();
  }

  function refresh() {
    if (G) G.linkWidth(G.linkWidth());
  }

  // Keep the focused node clear of the reader panel
  function readerOffset() {
    if (!document.body.classList.contains("reading")) return [0, 0];
    if (innerWidth <= 760) return [0, innerHeight * 0.39];
    return [($("#reader").offsetWidth + 12) / 2, 0];
  }

  // Zoom to a set of nodes, framed inside whatever part of the screen the reader leaves free
  function fitFocus(ms = 700, only) {
    const ns = only ? G.graphData().nodes.filter((n) => only.has(n.id)) : G.graphData().nodes;
    if (!ns.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of ns) {
      const r = radius(n);
      x0 = Math.min(x0, n.x - r); x1 = Math.max(x1, n.x + r);
      y0 = Math.min(y0, n.y - r); y1 = Math.max(y1, n.y + r + 14);
    }
    const [dx, dy] = readerOffset();
    const W = innerWidth - dx * 2, H = innerHeight - dy * 2, pad = innerWidth <= 760 ? 24 : 70;
    const k = Math.max(0.08, Math.min(2.4, (W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (y1 - y0 || 1)));
    G.zoom(k, ms);
    G.centerAt((x0 + x1) / 2 + dx / k, (y0 + y1) / 2 + dy / k, ms);
  }

  function enterLocal(n) {
    state.localSet = new Set([n.id, ...state.adj.get(n.id)]);
    for (const id of state.localSet) state.hidden.delete(state.byId.get(id).g);
    renderLegend();
    syncData();
    G.d3ReheatSimulation();
    state.pendingFit = true;
    for (const t of [300, 1200, 2600, 4500]) setTimeout(() => { if (state.local && state.selected === n) fitFocus(500); }, t);
  }

  function exitLocal() {
    state.localSet = null;
    syncData();
  }

  function setLocal(on) {
    state.local = on;
    $("#btn-local").setAttribute("aria-pressed", on);
    if (on && state.selected) enterLocal(state.selected);
    else if (!on) { exitLocal(); if (state.selected) { highlight(state.selected); fitFocus(700, state.hiNodes); } }
    refresh();
  }

  // ---------- Legend ----------
  function renderLegend() {
    const counts = {};
    for (const n of state.nodes) counts[n.g] = (counts[n.g] || 0) + 1;
    const el = $("#legend");
    el.innerHTML = "";
    for (const [g] of GROUPS) {
      if (!counts[g] || g === "Home") continue;
      const b = document.createElement("button");
      b.className = "chip";
      b.setAttribute("aria-pressed", !state.hidden.has(g));
      b.title = `Show / hide ${g}. Shift-click to show only ${g}.`;
      b.innerHTML = `<span class="dot" style="background:${state.colors[g]};color:${state.colors[g]}"></span>${g}<span class="n">${counts[g]}</span>`;
      b.onclick = (e) => {
        if (e.shiftKey || e.altKey) {
          const only = GROUPS.map(([x]) => x).filter((x) => x !== g && x !== "Home");
          const already = only.every((x) => state.hidden.has(x));
          state.hidden = already ? new Set() : new Set(only);
        } else if (state.hidden.has(g)) state.hidden.delete(g);
        else state.hidden.add(g);
        renderLegend();
        syncData();
        if (!state.local) setTimeout(() => fitFocus(600), 900);
      };
      el.appendChild(b);
    }
  }

  // ---------- Notes ----------
  async function loadNote(id) {
    if (!state.noteCache.has(id)) {
      state.noteCache.set(id, fetch(`n/${encodeURIComponent(id)}.json`).then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }));
    }
    return state.noteCache.get(id);
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const META_LABELS = { testament: "Testament", category: "Category", role: "Role", first_appearance: "First appears", region: "Region", period: "Period", date: "Date", chapters: "Chapters", translation: "Translation" };

  async function openReader(n, ref) {
    const art = $("#article");
    if (state.rendered === n.id && art.querySelector(".meta, h2, p")) { jumpToRef(ref); return; }
    state.rendered = null;
    const color = state.colors[n.g];
    $("#crumbs").innerHTML = `<span class="dot" style="background:${color}"></span><b>${escapeHtml(n.g)}</b>${n.f ? " · " + escapeHtml(n.f) : ""}`;
    art.innerHTML = `<h1 class="title">${escapeHtml(n.t)}</h1><div class="loading">Loading…</div>`;
    $("#connections").innerHTML = "";
    document.body.classList.add("reading");
    $("#reader").hidden = false;
    $("#reader-scroll").scrollTop = 0;

    let note;
    try { note = await loadNote(n.id); } catch { art.querySelector(".loading").textContent = "Couldn't load this note."; return; }
    if (state.selected !== n) return;

    const meta = Object.entries(note.meta)
      .filter(([k]) => META_LABELS[k])
      .map(([k, v]) => `<span>${META_LABELS[k]} <b>${escapeHtml(v)}</b></span>`)
      .join("");
    art.innerHTML = `<h1 class="title">${escapeHtml(note.title)}</h1>${meta ? `<div class="meta">${meta}</div>` : ""}${marked.parse(note.md)}`;
    for (const a of art.querySelectorAll("a.wl")) {
      const t = state.byId.get(a.dataset.id);
      if (t) { a.dataset.g = t.g; a.style.setProperty("--g", state.colors[t.g]); }
    }
    for (const a of art.querySelectorAll('a[href^="http"]')) { a.target = "_blank"; a.rel = "noopener"; }
    state.rendered = n.id;
    jumpToRef(ref);

    const chips = (ids) =>
      ids
        .map((id) => state.byId.get(id))
        .filter(Boolean)
        .sort((a, b) => b.d - a.d)
        .map((x) => `<a href="#/${x.id}" class="wl" data-id="${x.id}" style="--g:${state.colors[x.g]}"><i></i>${escapeHtml(x.t)}</a>`)
        .join("");
    const outIds = [...new Set([...art.querySelectorAll("a.wl")].map((a) => a.dataset.id))].filter((id) => id !== n.id);
    const back = note.backlinks.filter((id) => id !== n.id);
    $("#connections").innerHTML =
      (back.length ? `<h3>Linked from · ${back.length}</h3><div class="list">${chips(back)}</div>` : "") +
      (outIds.length ? `<h3>Links to · ${outIds.length}</h3><div class="list">${chips(outIds)}</div>` : "") +
      (note.tags.length ? `<h3>Tags</h3><div class="list tags">${note.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join("")}</div>` : "");
  }

  // Scroll the reader to a verse ("24:46-49") or chapter ("22") and highlight it
  function jumpToRef(ref) {
    const art = $("#article"), scroller = $("#reader-scroll");
    for (const el of art.querySelectorAll(".hl")) el.classList.remove("hl");
    if (!ref) return;
    const [, c, v1, v2] = ref.match(/^(\d+)(?::(\d+)(?:-(\d+))?)?$/) || [];
    if (!c) return;
    const anchor = art.querySelector(v1 ? `#v-${c}-${v1}` : `#c-${c}`);
    if (!anchor) return;
    let first = v1 ? anchor.parentElement : anchor.nextElementSibling || anchor;
    if (v1) {
      const end = (v2 && art.querySelector(`#v-${c}-${v2}`)?.parentElement) || first;
      for (let p = first; p; p = p.nextElementSibling) {
        p.classList.add("hl");
        if (p === end || p.tagName === "H2") break;
      }
    } else first.classList.add("hl");
    const top = first.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: Math.max(0, top - 90), behavior: "smooth" });
  }

  function closeReader() {
    document.body.classList.remove("reading");
    setTimeout(() => { if (!state.selected) $("#reader").hidden = true; }, 360);
  }

  // ---------- Routing ----------
  const currentId = () => decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/")[0];
  const currentRef = () => decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/")[1] || "";
  const go = (id) => { location.hash = id ? `/${id}` : "/"; };

  function route() {
    const id = currentId();
    const n = state.byId.get(id) || null;
    const prev = state.selected;
    state.selected = n;
    hidePopover();
    if (n && prev && prev !== n) state.cameFrom = prev;
    $("#btn-back").hidden = !(n && state.cameFrom && state.cameFrom !== n);
    if (!n) {
      highlight(state.hover);
      closeReader();
      if (state.local && prev) exitLocal();
      if (prev) setTimeout(() => fitFocus(800), 380);
      document.title = "Bible Study Graph";
      state.cameFrom = null;
      state.rendered = null;
      return;
    }
    const ref = currentRef();
    if (n === prev) { openReader(n, ref); return; }
    document.title = `${n.t} · Bible Study Graph`;
    // Source text stays out of the sky; light up its book instead
    if (n.g === "Source Text" && state.hidden.has(n.g)) {
      const book = [...state.adj.get(n.id)].map((id) => state.byId.get(id)).find((x) => x.g === "Books");
      highlight(book && inGraph.has(book.id) ? book : null);
      openReader(n, ref);
      return;
    }
    if (state.hidden.has(n.g)) { state.hidden.delete(n.g); renderLegend(); syncData(); }
    if (state.local) {
      if (prev && !state.localSet?.has(n.id)) exitLocal();
      highlight(n);
      openReader(n, ref);
      if (n.g !== "Home") enterLocal(n);
    } else {
      highlight(n);
      openReader(n, ref);
      if (inGraph.has(n.id)) requestAnimationFrame(() => fitFocus(750, state.hiNodes));
    }
  }

  // ---------- Search ----------
  let results = [], cursor = 0;
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function score(n, q) {
    const t = norm(n.t);
    if (t === q) return 1000 + n.d;
    if (t.startsWith(q)) return 600 + n.d;
    if (n.a.some((a) => norm(a).startsWith(q))) return 450 + n.d;
    if (t.split(/[\s(-]+/).some((w) => w.startsWith(q))) return 350 + n.d;
    if (t.includes(q)) return 200 + n.d;
    return 0;
  }

  async function runSearch() {
    const raw = $("#q").value.trim();
    const q = norm(raw);
    const list = $("#results");
    if (!q) { list.hidden = true; results = []; return; }
    const titleHits = state.nodes
      .map((n) => [n, score(n, q)])
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([n]) => ({ n }));

    let textHits = [];
    if (q.length >= 3) {
      if (!state.search) state.search = fetch("search.json").then((r) => r.json()).catch(() => []);
      const idx = await state.search;
      if ($("#q").value.trim() !== raw) return;
      const seen = new Set(titleHits.map((h) => h.n.id));
      for (const [id, text] of idx) {
        if (seen.has(id)) continue;
        const i = norm(text).indexOf(q);
        if (i < 0) continue;
        const n = state.byId.get(id);
        if (!n) continue;
        const s = Math.max(0, i - 40);
        textHits.push({ n, snip: (s ? "…" : "") + text.slice(s, i + q.length + 70) + "…", i });
        if (textHits.length >= 8) break;
      }
    }
    results = [...titleHits, ...textHits];
    cursor = 0;
    const row = (h, i) =>
      `<li role="option" data-i="${i}" aria-selected="${i === cursor}"><span class="dot" style="background:${state.colors[h.n.g]}"></span><span class="r-body"><span class="r-title">${escapeHtml(h.n.t)}</span>${h.snip ? `<span class="r-snip">${escapeHtml(h.snip)}</span>` : ""}</span><span class="r-sub">${escapeHtml(h.n.g)}</span></li>`;
    list.innerHTML = results.length
      ? titleHits.map(row).join("") +
        (textHits.length ? `<li class="section">Mentioned in</li>` + textHits.map((h, j) => row(h, titleHits.length + j)).join("") : "")
      : `<li class="empty">No matches</li>`;
    list.hidden = false;
  }

  function moveCursor(d) {
    if (!results.length) return;
    cursor = (cursor + d + results.length) % results.length;
    for (const li of $("#results").querySelectorAll("li[data-i]")) li.setAttribute("aria-selected", +li.dataset.i === cursor);
    $(`#results li[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function pick(i) {
    const h = results[i];
    if (!h) return;
    $("#q").value = "";
    $("#results").hidden = true;
    $("#q").blur();
    go(h.n.id);
  }

  // ---------- Popover previews ----------
  let popTimer, hoverLink = null;
  function hidePopover() { clearTimeout(popTimer); $("#popover").hidden = true; }
  function placePopover(a) {
    const pop = $("#popover");
    pop.hidden = false;
    const r = a.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.min(Math.max(12, r.left), innerWidth - w - 12) + "px";
    pop.style.top = (r.bottom + 8 + h > innerHeight - 12 ? r.top - h - 8 : r.bottom + 8) + "px";
  }

  function showVersePopover(a) {
    clearTimeout(popTimer);
    popTimer = setTimeout(async () => {
      let note;
      try { note = await loadNote(a.dataset.src); } catch { return; }
      if (hoverLink !== a) return;
      const [, c, v1, v2] = a.dataset.ref.match(/^(\d+)(?::(\d+)(?:-(\d+))?)?$/) || [];
      const from = Number(v1 || 1), to = Math.min(v1 ? Number(v2 || v1) : 3, from + 5);
      const verses = [];
      for (let v = from; v <= to; v++) {
        const m = note.md.match(new RegExp(`<a id="v-${c}-${v}"></a>\\*\\*[^*]+\\*\\*\\s*([^\\n]*)`));
        if (m) verses.push(`<sup>${v}</sup>${m[1].replace(/<(?!\/?mark>)[^>]+>/g, "")}`);
      }
      if (!verses.length) return;
      const more = v1 && v2 && Number(v2) > to ? " …" : !v1 ? " …" : "";
      $("#popover").innerHTML = `<div class="p-title">${escapeHtml(a.textContent)}</div><div class="p-sub">King James Version${v1 ? "" : " · opening verses"}</div><div class="p-body verse">${verses.join(" ")}${more}</div>`;
      placePopover(a);
    }, 220);
  }

  function showPopover(a) {
    clearTimeout(popTimer);
    popTimer = setTimeout(async () => {
      const id = a.dataset.id;
      const n = state.byId.get(id);
      if (!n || !a.isConnected) return;
      let note;
      try { note = await loadNote(id); } catch { return; }
      if (hoverLink !== a) return;
      const tmp = document.createElement("div");
      const cut = note.md.lastIndexOf("\n\n", 2500);
      tmp.innerHTML = marked.parse(note.md.slice(0, cut > 0 ? cut : 2500));
      const text = [...tmp.querySelectorAll("p, li")].map((p) => p.textContent).join(" ").slice(0, 420);
      const pop = $("#popover");
      pop.innerHTML = `<div class="p-title">${escapeHtml(note.title)}</div><div class="p-sub" style="color:${state.colors[n.g]}">${escapeHtml(n.g)}${n.f ? " · " + escapeHtml(n.f) : ""}</div><div class="p-body">${escapeHtml(text)}</div>`;
      pop.hidden = false;
      const r = a.getBoundingClientRect();
      const w = pop.offsetWidth, h = pop.offsetHeight;
      let x = Math.min(Math.max(12, r.left), innerWidth - w - 12);
      let y = r.bottom + 8;
      if (y + h > innerHeight - 12) y = r.top - h - 8;
      pop.style.left = x + "px";
      pop.style.top = y + "px";
    }, 280);
  }

  // ---------- Wire up ----------
  function bindUI() {
    const q = $("#q");
    q.addEventListener("input", runSearch);
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); moveCursor(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveCursor(-1); }
      else if (e.key === "Enter") { e.preventDefault(); pick(cursor); }
      else if (e.key === "Escape") { q.value = ""; $("#results").hidden = true; q.blur(); }
    });
    q.addEventListener("focus", () => { if (q.value.trim()) runSearch(); });
    $("#results").addEventListener("mousedown", (e) => {
      const li = e.target.closest("li[data-i]");
      if (li) { e.preventDefault(); pick(+li.dataset.i); }
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search")) $("#results").hidden = true; });

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea")) return;
      if (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); q.focus(); q.select(); }
      else if (e.key === "Escape" && state.selected) go("");
      else if (e.key === "l") setLocal(!state.local);
    });

    $("#btn-close").onclick = () => go("");
    $("#btn-home").onclick = () => go("index");
    $("#btn-local").onclick = () => setLocal(!state.local);
    $("#btn-fit").onclick = () => fitFocus();
    $("#btn-labels").setAttribute("aria-pressed", state.labels);
    $("#btn-labels").onclick = () => {
      state.labels = !state.labels;
      store.set("labels", state.labels ? "1" : "0");
      $("#btn-labels").setAttribute("aria-pressed", state.labels);
      refresh();
    };
    $("#btn-theme").onclick = () => {
      const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      store.set(`theme:${designName}`, t);
      applyTheme(t);
    };

    const reader = $("#reader");
    reader.addEventListener("mouseover", (e) => {
      hoverLink = e.target.closest("a.wl, a.vref");
      const v = e.target.closest("a.vref");
      if (v && matchMedia("(hover: hover)").matches) return showVersePopover(v);
      const a = e.target.closest("a.wl");
      if (a && matchMedia("(hover: hover)").matches) showPopover(a);
    });
    reader.addEventListener("mouseout", (e) => { if (e.target.closest("a.wl, a.vref")) { hoverLink = null; hidePopover(); } });
    reader.addEventListener("click", (e) => { if (e.target.closest("a.wl, a.vref")) hidePopover(); });
    $("#btn-back").onclick = () => history.back();

    addEventListener("hashchange", route);
  }

  async function main() {
    const data = await fetch("graph.json").then((r) => r.json());
    const order = data.nodes.map((n) => n.id);
    state.nodes = data.nodes.sort((a, b) => b.d - a.d);
    for (const n of state.nodes) {
      state.byId.set(n.id, n);
      state.adj.set(n.id, new Set());
      const c = CLUSTERS[n.g] || [0, 0];
      const a = rand() * 2 * Math.PI, d = Math.sqrt(rand()) * 160;
      n.x = c[0] + Math.cos(a) * d;
      n.y = c[1] + Math.sin(a) * d;
    }
    state.links = data.links.map(([a, b]) => {
      const s = order[a], t = order[b];
      state.adj.get(s).add(t);
      state.adj.get(t).add(s);
      return { source: s, target: t };
    });
    $("#stat-notes").textContent = state.nodes.length.toLocaleString();
    $("#stat-links").textContent = state.links.length.toLocaleString();

    initGraph();
    document.documentElement.dataset.design = designName;
    if (new URLSearchParams(location.search).has("embed")) document.documentElement.dataset.embed = "";
    applyTheme(store.get(`theme:${designName}`) || D.theme || "dark");
    if (D.setup) D.setup(designApi());
    bindUI();
    syncData();
    fitFocus(0);
    if (currentId()) setTimeout(route, 300);
    else state.pendingFit = true;
    showLanding();
  }

  // Landing window: shown on arrival at the overview, skipped for deep links and embeds
  function showLanding() {
    const landing = $("#landing");
    if (!landing) return;
    if (currentId() || "embed" in document.documentElement.dataset) { landing.remove(); return; }
    $("#landing-notes").textContent = state.nodes.length.toLocaleString();
    $("#landing-links").textContent = state.links.length.toLocaleString();
    landing.hidden = false;
    const enter = () => {
      landing.classList.add("is-gone");
      setTimeout(() => landing.remove(), 600);
      document.removeEventListener("keydown", onKey, true);
    };
    // Capture keys while open so the graph's own shortcuts don't fire underneath
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); enter(); }
      if (e.key !== "Tab") e.stopImmediatePropagation();
    };
    $("#landing-enter").addEventListener("click", enter);
    document.addEventListener("keydown", onKey, true);
    $("#landing-enter").focus();
  }

  main();
})();
