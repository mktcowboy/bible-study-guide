// Precomputes the Constellation graph layout at build time, so the browser can draw the
// settled sky immediately instead of running ~400 simulation ticks on load.
// Mirrors the forces in app/designs/constellation.js and the cluster map in app/app.js;
// keep the three in sync if the look of the overview changes.
import { forceCenter, forceLink, forceManyBody, forceSimulation } from "./d3-force.mjs";

const CLUSTERS = {
  Books: [0, 0],
  People: [-560, 10],
  Events: [560, 40],
  Places: [40, -500],
  Themes: [-300, 440],
  "Source Text": [190, 430],
  Timelines: [-330, -400],
  Quotes: [-230, -440],
};
const SPREAD = 1.2;
const TICKS = 400;

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const radius = (n) => 1 + Math.pow(n.d || 0, 0.6) * 0.45;

function clusterForce(centers, bright) {
  let nodes = [];
  const f = (alpha) => {
    for (const n of nodes) {
      const c = centers[n.g] || [0, 0];
      const s = (0.035 + 0.055 * bright(n)) * alpha;
      n.vx += (c[0] - n.x) * s;
      n.vy += (c[1] - n.y) * s;
    }
  };
  f.initialize = (ns) => (nodes = ns);
  return f;
}

function collideForce(rand) {
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

// nodes: [{ id, g, d }], links: [[i, j]] (indexes into nodes). Returns Map id -> [x, y].
export function layout(nodes, links) {
  const rand = seeded(7);
  const sim = nodes.filter((n) => n.g !== "Home").map((n) => ({ id: n.id, g: n.g, d: n.d }));
  const byId = new Map(sim.map((n) => [n.id, n]));
  const dMax = Math.max(1, ...sim.map((n) => n.d || 0));
  const bright = (n) => Math.min(1, Math.max(0, Math.log1p(n.d || 0) / Math.log1p(dMax)));
  const centers = Object.fromEntries(Object.entries(CLUSTERS).map(([g, c]) => [g, [c[0] * SPREAD, c[1] * SPREAD]]));

  for (const n of sim) {
    const c = centers[n.g] || [0, 0];
    const a = rand() * 2 * Math.PI, d = Math.sqrt(rand()) * 300;
    n.x = c[0] + Math.cos(a) * d;
    n.y = c[1] + Math.sin(a) * d;
  }

  const edges = [];
  const deg = new Map(sim.map((n) => [n.id, 0]));
  for (const [a, b] of links) {
    const s = byId.get(nodes[a].id), t = byId.get(nodes[b].id);
    if (!s || !t) continue;
    edges.push({ source: s, target: t });
    deg.set(s.id, deg.get(s.id) + 1);
    deg.set(t.id, deg.get(t.id) + 1);
  }

  forceSimulation(sim)
    .velocityDecay(0.38)
    .alphaMin(0)
    .force("center", forceCenter())
    .force("charge", forceManyBody().strength(-34).distanceMax(260))
    .force(
      "link",
      forceLink(edges)
        .distance((l) => (l.source.g === l.target.g ? 30 : 54))
        .strength((l) => {
          const w = 1 / Math.sqrt(Math.max(1, Math.min(deg.get(l.source.id), deg.get(l.target.id))));
          return l.source.g === l.target.g ? 0.34 * w : 0.1 * w;
        })
    )
    .force("cluster", clusterForce(centers, bright))
    .force("collide", collideForce(rand))
    .stop()
    .tick(TICKS);

  return new Map(sim.map((n) => [n.id, [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10]]));
}
