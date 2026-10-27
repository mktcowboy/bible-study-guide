# Holy Bible - Obsidian Study Guide

A published, fully interlinked Bible study vault — 1,139 notes covering all 66 canonical books (KJV), plus people, places, events, themes, and timelines. Authored in [Obsidian](https://obsidian.md) and published as two live sites built from the same notes.

| ✦ Star Graph | ▤ Quartz Wiki |
| :--- | :--- |
| **[mktcowboy.github.io/bible-study-guide](https://mktcowboy.github.io/bible-study-guide/)** | **[mktcowboy.github.io/bible-study-guide/quartz](https://mktcowboy.github.io/bible-study-guide/quartz/)** |
| The whole guide drawn as a night sky; click any star to read the note in a side panel. | The classic wiki layout with a file explorer, hover previews, backlinks and a local graph on every page. |

On both sites, every scripture reference (e.g. "Luke 24:46-49", "Psalm 22") links to that verse or chapter in the KJV source text.

## Last updated

**October 26, 2026** · 1,139 notes

Latest changes: the Quartz version is back at `/quartz/`, alongside the star graph, and every scripture reference on both sites now links to its verse in the KJV source text. Previously: replaced Quartz with a custom graph-first site, and old Quartz URLs redirect to the new pages. Before that: added the Words of Christ hub (2,029 red-letter sayings), gave the Father, Son, and Holy Spirit their own Holy Trinity folder, and highlighted Christ's words inline in the New Testament KJV source text.

## Structure

- `content/` — the published notes (synced from the Obsidian vault)
  - `01 Books/` — Old and New Testament book notes
  - `02 People/` — 368 people notes, organized by category (including the Holy Trinity)
  - `03 Places/` — 156 place notes, grouped by type
  - `04 Events/` — 435 event notes, grouped by canonical section
  - `05 Themes/` — 41 theme hubs
  - `06 Quotes/` — Words of Christ hub: every red-letter saying of Jesus, by book
  - `07 Source Text/` — public-domain KJV source text, one note per book, with the words of Christ in red
  - `08 Timelines/` — canonical, prophetic, New Testament, and intertestamental timelines
- `app/` — the front end (single-page app: `index.html`, `style.css`, `app.js`, `404.html` redirect)
- `build.mjs` — build script: reads `content/` and writes the star-graph site to `public/`
- `quartz-site/` — the Quartz version (Quartz v4.5.2, MIT, see `quartz-site/LICENSE.txt`). `link-verses.mjs` copies `content/` to `.build/content/`, adding scripture links, before Quartz builds it into `public/quartz/`. The Quartz link crawler is patched so verse links stay out of the graph and backlinks.
- `.github/workflows/deploy.yml` — builds both sites into `public/` and deploys to GitHub Pages on every push to `main`

## Develop locally

```bash
node build.mjs
npx serve public
# or: python3 -m http.server -d public 8080
```

Then open the URL `serve` prints (or http://localhost:8080 with Python).

To build the Quartz version too (needs `npm ci` in `quartz-site/` once):

```bash
cd quartz-site
node link-verses.mjs
npx quartz build --directory ../.build/content --output ../public/quartz
```

It is then served at `/quartz/` alongside the star graph.

## Updating content

Edit notes in the Obsidian vault (the `Bible-Vault` repo), then run `scripts/sync_to_guide.sh` there. It mirrors `Bible/` into this repo's `content/`. Review the diff here, then commit and push. The GitHub Action rebuilds and redeploys automatically.

---

The KJV text is public domain.
