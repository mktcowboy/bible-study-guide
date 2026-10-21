// Builds the graph site from content/ into public/. No dependencies.
// Usage: node build.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONTENT = path.join(ROOT, "content");
const APP = path.join(ROOT, "app");
const OUT = path.join(ROOT, "public");

const GROUPS = {
  "01 Books": "Books",
  "02 People": "People",
  "03 Places": "Places",
  "04 Events": "Events",
  "05 Themes": "Themes",
  "06 Quotes": "Quotes",
  "07 Source Text": "Source Text",
  "08 Timelines": "Timelines",
};

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.name.startsWith(".")) return [];
    return e.isDirectory() ? walk(p) : e.name.endsWith(".md") ? [p] : [];
  });
}

// Minimal YAML frontmatter: scalars, [inline, lists], and "- item" lists.
function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: src };
  const data = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v === "") {
      data[k] = [];
      listKey = k;
    } else if (v.startsWith("[") && v.endsWith("]")) {
      data[k] = v.slice(1, -1).split(",").map((x) => unquote(x.trim())).filter(Boolean);
      listKey = null;
    } else {
      data[k] = unquote(v);
      listKey = null;
    }
  }
  return { data, body: src.slice(m[0].length) };
}
const unquote = (s) => s.replace(/^["']|["']$/g, "");

// --- Load notes
const files = walk(CONTENT);
const notes = files.map((file) => {
  const rel = path.relative(CONTENT, file);
  const parts = rel.split(path.sep);
  const name = path.basename(file, ".md");
  const { data, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  return {
    file,
    name,
    id: name === "index" ? "index" : slugify(name),
    group: name === "index" ? "Home" : GROUPS[parts[0]] || "Other",
    folder: parts.slice(1, -1).join(" / "),
    data,
    body,
  };
});

const byKey = new Map();
const ids = new Set();
for (const n of notes) {
  // Distinct names can slugify alike ("Baal Peor" / "Baal-Peor"); suffix the later one
  let id = n.id, k = 2;
  while (ids.has(id)) id = `${n.id}-${k++}`;
  n.id = id;
  ids.add(id);
}
for (const n of notes) byKey.set(n.name.toLowerCase(), n);
for (const n of notes) {
  const aliases = [].concat(n.data.aliases || []);
  for (const a of aliases) if (!byKey.has(a.toLowerCase())) byKey.set(a.toLowerCase(), n);
}
const resolve = (target) => byKey.get(target.trim().toLowerCase());

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// --- Scripture references → links into the KJV source text
const sourceOf = new Map(); // book name (lowercase) → { id, chapters }
for (const n of notes) {
  const m = n.data.type === "source-text" && String(n.data.book || "").match(/\[\[([^\]|]+)/);
  if (m) sourceOf.set(m[1].toLowerCase(), { id: n.id });
}
for (const n of notes) {
  const src = n.data.type === "bible-book" && sourceOf.get(n.name.toLowerCase());
  if (src) src.chapters = Number(n.data.chapters) || 150;
}
if (sourceOf.has("psalms")) sourceOf.set("psalm", sourceOf.get("psalms"));
if (sourceOf.has("song of solomon")) sourceOf.set("song of songs", sourceOf.get("song of solomon"));
const bookAlt = [...sourceOf.keys()]
  .sort((a, b) => b.length - a.length)
  .map((b) => b.replace(/ /g, "\\s+"))
  .join("|");
// Book C, Book C:V, Book C:V-V, Book C–C (en dash or hyphen)
const REF = new RegExp(`\\b(${bookAlt})\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3})(?!\\s*:))?|\\s*[-–]\\s*\\d{1,3}(?!\\s*:))?(?![\\d:])`, "gi");
let refCount = 0;

function linkScripture(html) {
  // Only touch text between tags, never inside an existing link
  return html.replace(/(<a\b[\s\S]*?<\/a>|<[^>]+>|\u0000\d+\u0000)|([^<\u0000]+)/g, (all, skip, text) => {
    if (skip || !text) return all;
    return text.replace(REF, (m, book, ch, v1, v2) => {
      const src = sourceOf.get(book.replace(/\s+/g, " ").toLowerCase());
      if (!src || Number(ch) < 1 || Number(ch) > src.chapters) return m;
      refCount++;
      const target = v1 ? `${ch}:${v1}${v2 ? "-" + v2 : ""}` : ch;
      return `<a class="vref" href="#/${src.id}/${target}" data-src="${src.id}" data-ref="${target}">${m}</a>`;
    });
  });
}

// --- Transform bodies, collect links
const index = new Map(notes.map((n, i) => [n.id, i]));
const edgeSet = new Set();
const missing = new Map();

for (const n of notes) {
  const src = index.get(n.id);
  n.out = new Set();
  // Obsidian "## Tags" footer → payload tags
  n.inlineTags = new Set();
  let body = n.body
    .replace(/^##\s+Tags\s*\n+((?:#[\w/-]+[ \t]*)+)\s*$/m, (_, line) => {
      for (const t of line.match(/#[\w/-]+/g)) n.inlineTags.add(t.slice(1));
      return "";
    })
    .replace(/^<\/?(content|invoke|parameter)>\s*$/gm, "");
  // Keep code spans verbatim
  const stash = [];
  body = body.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (m) => `\u0000${stash.push(m) - 1}\u0000`);
  body = body.replace(/!?\[\[([^\]]+?)\]\]/g, (_, inner) => {
    const [rawTarget, ...rest] = inner.split(/\\?\|/);
    const [target, heading] = rawTarget.split("#");
    const label = rest.length ? rest.join("|") : heading && !target ? heading : target;
    const hit = target ? resolve(target) : n;
    if (!hit) {
      missing.set(target, (missing.get(target) || 0) + 1);
      return `<span class="wl-missing">${esc(label)}</span>`;
    }
    if (hit !== n) {
      n.out.add(hit.id);
      const a = src, b = index.get(hit.id);
      edgeSet.add(a < b ? `${a}-${b}` : `${b}-${a}`);
    }
    return `<a class="wl" data-id="${hit.id}" href="#/${hit.id}">${esc(label)}</a>`;
  });
  // ==text== → red-letter / highlight
  body = body.replace(/==([^=\n]+?)==/g, '<mark>$1</mark>');
  if (n.data.type === "source-text") {
    // Anchors for verse and chapter deep links: **Genesis 1:1** → id v-1-1; ## Genesis 1 → id c-1
    body = body
      .replace(/^\*\*[^*\n]*?(\d+):(\d+)\*\*/gm, (m, c, v) => `<a id="v-${c}-${v}"></a>${m}`)
      .replace(/^##\s+[^\n]*?(\d+)\s*$/gm, (m, c) => `<a id="c-${c}"></a>\n\n${m}`);
  } else {
    body = linkScripture(body);
  }
  body = body.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[i]);
  // Drop the leading H1 (the reader shows the title); keep it as a subtitle if it says more
  const title = (n.data.title || n.name).toLowerCase();
  body = body.replace(/^\s*#[ \t]+(.*)\r?\n/, (_, h) =>
    h.trim().toLowerCase() === title ? "" : `<p class="subtitle">${h.trim()}</p>\n`);
  n.html = body;
}

// --- Backlinks + degree
const backlinks = new Map(notes.map((n) => [n.id, []]));
for (const n of notes) for (const t of n.out) backlinks.get(t).push(n.id);

const links = [...edgeSet].map((e) => e.split("-").map(Number));
const degree = new Array(notes.length).fill(0);
for (const [a, b] of links) degree[a]++, degree[b]++;

const META_KEYS = ["testament", "category", "role", "first_appearance", "region", "period", "date", "book", "chapters", "translation"];
const plain = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/[#>*_`|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const nodes = notes.map((n, i) => ({
  id: n.id,
  t: n.data.title || n.name,
  g: n.group,
  f: n.folder,
  d: degree[i],
  a: [].concat(n.data.aliases || []).filter((a) => a !== n.name),
  ...(n.data.order ? { o: Number(n.data.order) } : {}),
  ...(n.data.testament ? { te: n.data.testament } : {}),
}));

// --- Write output
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "n"), { recursive: true });
fs.cpSync(APP, OUT, { recursive: true });

for (const n of notes) {
  const meta = {};
  for (const k of META_KEYS) if (n.data[k]) meta[k] = String(n.data[k]).replace(/\[\[|\]\]/g, "");
  const payload = {
    id: n.id,
    title: n.data.title || n.name,
    group: n.group,
    folder: n.folder,
    type: n.data.type || "",
    meta,
    tags: [...new Set([...[].concat(n.data.tags || []), ...n.inlineTags])],
    backlinks: backlinks.get(n.id),
    md: n.html,
  };
  fs.writeFileSync(path.join(OUT, "n", `${n.id}.json`), JSON.stringify(payload));
}

fs.writeFileSync(path.join(OUT, "graph.json"), JSON.stringify({ nodes, links }));

// Full-text search index (excerpt only; source text is excluded to keep it small)
const search = notes
  .filter((n) => n.group !== "Source Text")
  .map((n) => [n.id, plain(n.html).slice(0, 600)]);
fs.writeFileSync(path.join(OUT, "search.json"), JSON.stringify(search));

console.log(`${nodes.length} notes, ${links.length} links, ${refCount} scripture references → public/`);
if (missing.size) {
  const top = [...missing].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`${missing.size} unresolved link targets (top: ${top.map(([t, c]) => `${t}×${c}`).join(", ")})`);
}
