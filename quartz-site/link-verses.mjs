// Copies content/ to .build/content/ with scripture references turned into links.
//   - Source-text notes: each verse line gets an Obsidian block id (^v<chapter>-<verse>).
//   - Every other note: "Genesis 3:15", "Luke 24:46-49", "Psalm 22" become
//     [[Genesis (KJV Source)#^v3-15|Genesis 3:15]] (chapter refs point at verse 1).
// content/ itself is never modified; it stays a mirror of the Obsidian vault.
// Usage (from quartz-site/): node link-verses.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "content");
const OUT = path.join(ROOT, ".build", "content");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith(".")) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const frontmatter = (src) => {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const get = (k) => m && (m[1].match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m")) || [])[1];
  return { type: get("type"), book: get("book"), chapters: get("chapters") };
};

const files = walk(SRC);
const notes = files
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ file: f, name: path.basename(f, ".md"), src: fs.readFileSync(f, "utf8") }));

// book name (lowercase) → { source note name, chapter count }
const books = new Map();
for (const n of notes) {
  const fm = frontmatter(n.src);
  const book = fm.type === "source-text" && (fm.book || "").match(/\[\[([^\]|]+)/);
  if (book) books.set(book[1].toLowerCase(), { source: n.name, chapters: 150 });
}
for (const n of notes) {
  const fm = frontmatter(n.src);
  const b = fm.type === "bible-book" && books.get(n.name.toLowerCase());
  if (b && fm.chapters) b.chapters = Number(fm.chapters);
}
if (books.has("psalms")) books.set("psalm", books.get("psalms"));
if (books.has("song of solomon")) books.set("song of songs", books.get("song of solomon"));

const alt = [...books.keys()]
  .sort((a, b) => b.length - a.length)
  .map((b) => b.replace(/ /g, "\\s+"))
  .join("|");
// Book C, Book C:V, Book C:V-V, Book C-C (hyphen or en dash)
const REF = new RegExp(
  `\\b(${alt})\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–]\\s*\\d{1,3}(?!\\s*:))?|\\s*[-–]\\s*\\d{1,3}(?!\\s*:))?(?![\\d:])`,
  "gi",
);
// Pieces of a line that must not be touched
const PROTECTED = /(\[\[[^\]]*\]\]|!?\[[^\]]*\]\([^)]*\)|`[^`]*`|<[^>]+>|https?:\/\/\S+)/;

let refs = 0;
function linkLine(line) {
  const pipe = line.trimStart().startsWith("|") ? "\\|" : "|";
  return line
    .split(PROTECTED)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(REF, (m, book, ch, v) => {
            const b = books.get(book.replace(/\s+/g, " ").toLowerCase());
            if (!b || +ch < 1 || +ch > b.chapters) return m;
            refs++;
            return `[[${b.source}#^v${ch}-${v || 1}${pipe}${m}]]`;
          }),
    )
    .join("");
}

function transform(n) {
  const fm = frontmatter(n.src);
  const lines = n.src.split("\n");
  let inFront = lines[0] === "---", inCode = false;
  return lines
    .map((line, i) => {
      if (inFront) {
        if (i > 0 && line === "---") inFront = false;
        return line;
      }
      if (/^\s*```/.test(line)) inCode = !inCode;
      if (inCode) return line;
      if (fm.type === "source-text") {
        const v = line.match(/^\*\*[^*\n]*?(\d+):(\d+)\*\*/);
        return v ? `${line.trimEnd()} ^v${v[1]}-${v[2]}` : line;
      }
      if (/^\s*#/.test(line)) return line; // leave headings alone
      return linkLine(line);
    })
    .join("\n");
}

fs.rmSync(OUT, { recursive: true, force: true });
for (const f of files) {
  const dest = path.join(OUT, path.relative(SRC, f));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!f.endsWith(".md")) fs.copyFileSync(f, dest);
}
for (const n of notes) fs.writeFileSync(path.join(OUT, path.relative(SRC, n.file)), transform(n));
console.log(`${notes.length} notes, ${refs} scripture references linked → .build/content`);
