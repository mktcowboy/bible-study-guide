# Holy Bible - Obsidian Study Guide

A published, fully interlinked Bible study vault — 1,139 notes covering all 66 canonical books (KJV), plus people, places, events, themes, and timelines. Authored in [Obsidian](https://obsidian.md) and published as a custom, zero-dependency, graph-first static site.

## Last updated

**October 20, 2026** · 1,139 notes

Latest changes: replaced Quartz with a custom graph-first site (no Quartz, no dependencies); old Quartz URLs redirect to the new pages. Previously: added the Words of Christ hub (2,029 red-letter sayings), gave the Father, Son, and Holy Spirit their own Holy Trinity folder, and highlighted Christ's words inline in the New Testament KJV source text.

## Live site

https://mktcowboy.github.io/bible-study-guide/

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
- `build.mjs` — build script: reads `content/` and writes the site to `public/`
- `.github/workflows/deploy.yml` — runs `node build.mjs` and deploys `public/` to GitHub Pages on every push to `main`

## Develop locally

```bash
node build.mjs
npx serve public
# or: python3 -m http.server -d public 8080
```

Then open the URL `serve` prints (or http://localhost:8080 with Python).

## Updating content

Edit notes in the Obsidian vault (the `Bible-Vault` repo), then run `scripts/sync_to_guide.sh` there. It mirrors `Bible/` into this repo's `content/`. Review the diff here, then commit and push. The GitHub Action rebuilds and redeploys automatically.

---

The KJV text is public domain.
