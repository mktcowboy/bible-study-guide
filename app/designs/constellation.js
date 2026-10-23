// Constellation: the graph as a night sky (dark) or ink on parchment (light).
// Stars are pre-rendered sprites (glow, core, sparkle) cached by color + theme + size bucket.
(() => {
  "use strict";
  window.DESIGNS = window.DESIGNS || {};

  // ---------- Palette / CSS overrides ----------
  const style = document.createElement("style");
  style.textContent = `
:root[data-design="constellation"] {
  --bg: #04060d;
  --bg-glow: #0e1834;
  --panel: rgba(9, 13, 26, 0.8);
  --panel-solid: #0a0f1e;
  --line: rgba(200, 212, 255, 0.1);
  --link-edge: rgba(190, 205, 255, 0.055);
  --link-dim: rgba(190, 205, 255, 0.012);
  --link-hi: rgba(244, 200, 120, 0.72);
  --c-books: #f2c46d;
  --c-people: #82b4ff;
  --c-places: #6ed8a8;
  --c-events: #ff9b7d;
  --c-themes: #c4a0ff;
  --c-quotes: #ff7382;
  --c-source: #9ba6bd;
  --c-timelines: #67e3e8;
  --c-home: #ffffff;
}
:root[data-design="constellation"] body {
  background:
    radial-gradient(ellipse 55% 32% at 28% 30%, rgba(96, 74, 170, 0.10), transparent 70%),
    radial-gradient(ellipse 48% 30% at 76% 68%, rgba(40, 112, 168, 0.08), transparent 70%),
    radial-gradient(ellipse 120% 95% at 50% 45%, #0e1834 0%, #070b18 48%, #020308 100%) #04060d;
}
:root[data-design="constellation"][data-theme="light"] {
  --bg: #f3ecdd;
  --bg-glow: #fbf7ee;
  --panel: rgba(253, 250, 243, 0.9);
  --panel-solid: #fdfaf3;
  --text: #2a241b;
  --muted: #6d6252;
  --faint: #a0947f;
  --line: rgba(70, 55, 30, 0.14);
  --accent: #96690c;
  --link-edge: rgba(92, 72, 40, 0.085);
  --link-dim: rgba(92, 72, 40, 0.035);
  --link-hi: rgba(150, 105, 12, 0.8);
  --c-books: #a8790f;
  --c-people: #2d5aa8;
  --c-places: #2c7d62;
  --c-events: #b5502f;
  --c-themes: #6f4aa8;
  --c-quotes: #b3262f;
  --c-source: #6b6f7a;
  --c-timelines: #1d7c84;
  --c-home: #2a241b;
}
:root[data-design="constellation"][data-theme="light"] body {
  background:
    radial-gradient(ellipse 70% 60% at 50% 45%, #fdfaf3 0%, #f6efe1 55%, #ebe1cc 100%) #f3ecdd;
}`;
  document.head.appendChild(style);

  // ---------- Helpers ----------
  let S = null;            // app state (set in setup)
  let dMax = 183;          // highest degree (set in setup)
  let hubs = new Set();    // top ~25 by degree get a diffraction sparkle
  let sky = [];            // background star field (normalized tile coords)
  const cache = new Map();
  const DPR = () => window.devicePixelRatio || 1;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const bright = (n) => clamp(Math.log1p(n.d || 0) / Math.log1p(dMax), 0, 1);

  const rgbCache = new Map();
  function rgb(c) {
    let v = rgbCache.get(c);
    if (v) return v;
    const s = String(c || "").trim();
    let m;
    if ((m = s.match(/^#([0-9a-f]{3})$/i))) v = [...m[1]].map((h) => parseInt(h + h, 16));
    else if ((m = s.match(/^#([0-9a-f]{6})/i))) v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    else if ((m = s.match(/rgba?\(([^)]+)\)/i))) v = m[1].split(/[\s,\/]+/).slice(0, 3).map(Number);
    else v = [200, 205, 220];
    rgbCache.set(c, v);
    return v;
  }
  const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const WHITE = [255, 255, 255];

  // Sprite sizes snap to half-octave buckets of device pixels so the cache stays small
  function bucket(px) {
    px = clamp(px, 4, 384);
    return Math.round(2 ** (Math.ceil(Math.log2(px) * 2) / 2));
  }
  function sprite(key, px, paint) {
    const id = key + "|" + px;
    let cv = cache.get(id);
    if (!cv) {
      cv = document.createElement("canvas");
      cv.width = cv.height = px;
      paint(cv.getContext("2d"), px);
      cache.set(id, cv);
    }
    return cv;
  }
  function blit(ctx, cv, x, y, half) {
    ctx.drawImage(cv, x - half, y - half, half * 2, half * 2);
  }

  // Soft halo in the group color
  function glowSprite(color, dark, px) {
    return sprite("g" + color + dark, px, (c, s) => {
      const col = rgb(color), h = s / 2;
      const g = c.createRadialGradient(h, h, 0, h, h, h);
      if (dark) {
        const hot = mix(col, WHITE, 0.35);
        g.addColorStop(0, rgba(hot, 0.62));
        g.addColorStop(0.12, rgba(col, 0.42));
        g.addColorStop(0.32, rgba(col, 0.14));
        g.addColorStop(0.6, rgba(col, 0.045));
        g.addColorStop(1, rgba(col, 0));
      } else {
        g.addColorStop(0, rgba(col, 0.22));
        g.addColorStop(0.35, rgba(col, 0.08));
        g.addColorStop(0.7, rgba(col, 0.02));
        g.addColorStop(1, rgba(col, 0));
      }
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    });
  }

  // Bright core: near-white tinted with the group color (dark), solid colored dot (light).
  // The sprite spans CORE_EXT x the core radius so the edge can feather.
  const CORE_EXT = 1.5;
  function coreSprite(color, dark, px) {
    return sprite("c" + color + dark, px, (c, s) => {
      const col = rgb(color), h = s / 2, e = 1 / CORE_EXT;
      const g = c.createRadialGradient(h, h, 0, h, h, h);
      if (dark) {
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.42 * e, rgba(mix(col, WHITE, 0.82), 1));
        g.addColorStop(0.85 * e, rgba(mix(col, WHITE, 0.45), 0.9));
        g.addColorStop(1, rgba(col, 0));
      } else {
        const ink = mix(col, [30, 22, 12], 0.25);
        g.addColorStop(0, rgba(mix(col, WHITE, 0.18), 1));
        g.addColorStop(0.55 * e, rgba(col, 1));
        g.addColorStop(0.9 * e, rgba(ink, 1));
        g.addColorStop(1, rgba(ink, 0));
      }
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    });
  }

  // Faint 4-point diffraction spikes for the brightest hubs
  function sparkleSprite(color, dark, px) {
    return sprite("s" + color + dark, px, (c, s) => {
      const col = dark ? mix(rgb(color), WHITE, 0.6) : rgb(color), h = s / 2;
      const w = Math.max(1, s / 110);
      for (const vertical of [false, true]) {
        const g = vertical ? c.createLinearGradient(h, 0, h, s) : c.createLinearGradient(0, h, s, h);
        g.addColorStop(0, rgba(col, 0));
        g.addColorStop(0.36, rgba(col, 0.12));
        g.addColorStop(0.5, rgba(col, 0.9));
        g.addColorStop(0.64, rgba(col, 0.12));
        g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g;
        if (vertical) c.fillRect(h - w / 2, 0, w, s);
        else c.fillRect(0, h - w / 2, s, w);
      }
    });
  }

  // Background star field, tiled in screen space
  const TILE = 1024; // CSS px
  function skyTile(dark, dpr) {
    const px = Math.round(TILE * dpr);
    return sprite("sky" + dark, px, (c, s) => {
      for (const st of sky) {
        if (!dark && st.a < 0.25) continue; // parchment: a few faint flecks
        const x = st.x * s, y = st.y * s, r = st.r * dpr;
        const col = dark ? st.tint : [140, 110, 70];
        const a = dark ? st.a : st.a * 0.3;
        if (dark && st.r > 0.95) {
          const g = c.createRadialGradient(x, y, 0, x, y, r * 5);
          g.addColorStop(0, rgba(col, a * 0.35));
          g.addColorStop(1, rgba(col, 0));
          c.fillStyle = g;
          c.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
        }
        c.fillStyle = rgba(col, a);
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    });
  }

  // ---------- Forces ----------
  function clusterForce(centers) {
    let nodes = [];
    const f = (alpha) => {
      if (S && S.local) return;
      for (const n of nodes) {
        const c = centers[n.g] || [0, 0];
        // Hubs anchor their constellation; leaves mostly follow their links
        const s = (0.035 + 0.055 * bright(n)) * alpha;
        n.vx += (c[0] - n.x) * s;
        n.vy += (c[1] - n.y) * s;
      }
    };
    f.initialize = (ns) => (nodes = ns);
    return f;
  }

  function collideForce(radius, rand) {
    let nodes = [];
    const pad = 2.2;
    const rr = (n) => radius(n) * 0.85 + pad;
    const f = () => {
      const C = 36, grid = new Map();
      for (const n of nodes) {
        const key = Math.floor(n.x / C) + "," + Math.floor(n.y / C);
        (grid.get(key) || grid.set(key, []).get(key)).push(n);
      }
      for (const n of nodes) {
        const gx = Math.floor(n.x / C), gy = Math.floor(n.y / C), rn = rr(n);
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++) {
            const cell = grid.get(gx + i + "," + (gy + j));
            if (!cell) continue;
            for (const m of cell) {
              if (m.index <= n.index) continue;
              let dx = m.x - n.x, dy = m.y - n.y;
              const min = rn + rr(m);
              let d2 = dx * dx + dy * dy;
              if (d2 >= min * min) continue;
              if (!d2) { dx = rand() - 0.5; dy = rand() - 0.5; d2 = dx * dx + dy * dy; }
              const d = Math.sqrt(d2), push = ((min - d) / d) * 0.5;
              n.x -= dx * push; n.y -= dy * push;
              m.x += dx * push; m.y += dy * push;
            }
          }
      }
    };
    f.initialize = (ns) => (nodes = ns);
    return f;
  }

  // ---------- Design ----------
  window.DESIGNS.constellation = {
    label: "Constellation",
    theme: "dark",
    clusterLabels: false,

    radius(n) {
      return 1 + Math.pow(n.d || 0, 0.6) * 0.45;
    },

    setup(api) {
      const { G, nodes, adj, rand, CLUSTERS } = api;
      S = api.state;

      const real = nodes.filter((n) => n.g !== "Home");
      dMax = Math.max(1, ...real.map((n) => n.d || 0));
      hubs = new Set([...real].sort((a, b) => b.d - a.d).slice(0, 25).map((n) => n.id));

      // Constellation centers: the app's cluster map spread wider, so groups mingle at the edges
      const centers = {};
      for (const [g, c] of Object.entries(CLUSTERS)) centers[g] = [c[0] * 1.2, c[1] * 1.2];

      // Organic start: a wide, soft scatter around each center (skipped when the build shipped a layout)
      for (const n of S.prelaid ? [] : nodes) {
        const c = centers[n.g] || [0, 0];
        const a = rand() * 2 * Math.PI, d = Math.sqrt(rand()) * 300;
        n.x = c[0] + Math.cos(a) * d;
        n.y = c[1] + Math.sin(a) * d;
        n.vx = n.vy = 0;
      }

      // Background stars (deterministic)
      sky = [];
      for (let i = 0; i < 130; i++) {
        const t = rand();
        sky.push({
          x: rand(), y: rand(),
          r: 0.32 + Math.pow(rand(), 3) * 0.9,
          a: 0.1 + Math.pow(rand(), 2) * 0.5,
          tint: t < 0.14 ? [255, 222, 186] : t < 0.36 ? [182, 202, 255] : [228, 234, 255],
        });
      }

      const deg = (id) => (adj.get(id) ? adj.get(id).size : 1) || 1;
      G.d3Force("charge").strength(-34).distanceMax(260);
      G.d3Force("link")
        .distance((l) => (l.source.g === l.target.g ? 30 : 54))
        .strength((l) => {
          const w = 1 / Math.sqrt(Math.min(deg(l.source.id), deg(l.target.id)));
          if (S.local) return 0.7 * w;
          return l.source.g === l.target.g ? 0.34 * w : 0.1 * w;
        });
      G.d3Force("cluster", clusterForce(centers));
      G.d3Force("collide", collideForce(api.radius, rand));
    },

    drawNode(n, ctx, k, s) {
      const dark = s.theme !== "light";
      const r = s.r, b = bright(n), dpr = DPR();
      // On paper there is no glow to carry a star, so the ink dot itself runs larger
      const core = dark ? Math.max(r * (0.42 + 0.2 * b), 0.75 / k) : Math.max(r * (0.6 + 0.25 * b), 1.3 / k);
      const coreHalf = core * CORE_EXT;
      const coreCv = coreSprite(s.color, dark, bucket(coreHalf * 2 * k * dpr));

      if (!s.lit) {
        ctx.globalAlpha = 0.1;
        blit(ctx, coreCv, n.x, n.y, coreHalf);
        return;
      }

      // Halo: leaves get a whisper, hubs a generous bloom
      const glow = Math.max(r * (1.9 + 2.4 * b), core * 2.6);
      ctx.globalAlpha = Math.min(1, (dark ? 0.3 + 0.7 * b : 0.35 + 0.55 * b) * (s.focal ? 1.35 : 1));
      blit(ctx, glowSprite(s.color, dark, bucket(glow * 2 * k * dpr)), n.x, n.y, glow);

      if (dark && hubs.has(n.id)) {
        const len = Math.max(r * 4.6, 16 / k);
        ctx.globalAlpha = dark ? 0.5 : 0.32;
        blit(ctx, sparkleSprite(s.color, dark, bucket(len * 2 * k * dpr)), n.x, n.y, len);
      }

      ctx.globalAlpha = dark ? 0.72 + 0.28 * b : 0.85 + 0.15 * b;
      if (s.focal) ctx.globalAlpha = 1;
      blit(ctx, coreCv, n.x, n.y, coreHalf);

      if (s.focal) {
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(r, core) + 4 / k, 0, 2 * Math.PI);
        ctx.lineWidth = 1 / k;
        ctx.strokeStyle = dark ? rgba(mix(rgb(s.color), [255, 236, 200], 0.6), 1) : s.color;
        ctx.stroke();
      }
    },

    // All links in three batched paths (plain, dimmed, highlighted) instead of one stroke per link
    drawLinks(ctx, k, s) {
      const base = [], hi = [];
      for (const l of s.links) {
        const a = l.source, b = l.target;
        if (a.x == null || b.x == null) continue;
        (s.hiLinks.has(l) ? hi : base).push(a.x, a.y, b.x, b.y);
      }
      const stroke = (pts, style, width, alpha) => {
        if (!pts.length) return;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 4) { ctx.moveTo(pts[i], pts[i + 1]); ctx.lineTo(pts[i + 2], pts[i + 3]); }
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.stroke();
      };
      if (s.dim) stroke(base, s.edgeDim || "rgba(190,205,255,0.012)", 0.5 / k, 1);
      else {
        // Zoomed out, the web of links turns to haze; let it emerge as you zoom in
        const floor = s.theme === "light" ? 0.3 : 0.18;
        stroke(base, s.edge, 0.55 / k, Math.max(floor, Math.min(1, (k - 0.35) / 1.4)));
      }
      stroke(hi, s.edgeHi, 1 / k, 1);
    },

    drawLink(l, ctx, k, s) {
      const a = l.source, b = l.target;
      if (b.x == null) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (s.hi) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1 / k;
      } else if (s.dim) {
        ctx.strokeStyle = (S && S.edgeDim) || "rgba(190,205,255,0.012)";
        ctx.lineWidth = 0.5 / k;
      } else {
        // Zoomed out, the web of links turns to haze; let it emerge as you zoom in
        const floor = s.theme === "light" ? 0.3 : 0.18;
        ctx.globalAlpha = Math.max(floor, Math.min(1, (k - 0.35) / 1.4));
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 0.55 / k;
      }
      ctx.stroke();
    },

    drawBackground(ctx, k, api) {
      if (!sky.length) return;
      const dark = api.theme !== "light", dpr = DPR();
      const t = ctx.getTransform();
      const cv = ctx.canvas, T = Math.round(TILE * dpr);
      const tile = skyTile(dark, dpr);
      // A whisper of parallax so the sky feels deep while panning
      const ox = (((t.e * 0.04) % T) + T) % T - T;
      const oy = (((t.f * 0.04) % T) + T) % T - T;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = dark ? 1 : 0.8;
      for (let x = ox; x < cv.width; x += T)
        for (let y = oy; y < cv.height; y += T) ctx.drawImage(tile, x, y);
    },
  };
})();
