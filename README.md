# Holy Bible - Obsidian Study Guide

A published, fully interlinked Bible study vault — 1,137 notes covering all 66 canonical books (KJV), plus people, places, events, themes, and timelines. Authored in [Obsidian](https://obsidian.md) and published as a static site with [Quartz 4](https://quartz.jzhao.xyz/).

## Live site

https://mktcowboy.github.io/bible-study-guide/

## Structure

- `content/` — the published notes (synced from the Obsidian vault)
  - `01 Books/` — Old and New Testament book notes
  - `02 People/` — 366 people notes, organized by category
  - `03 Places/` — 156 place notes, grouped by type
  - `04 Events/` — 435 event notes, grouped by canonical section
  - `05 Themes/` — 42 theme hubs
  - `07 Source Text/` — public-domain KJV source text, one note per book
  - `08 Timelines/` — canonical, prophetic, New Testament, and intertestamental timelines
- `site/` — the Quartz static-site generator, its configuration, and license
- `.github/workflows/deploy.yml` — builds and deploys to GitHub Pages on every push to `main`

## Develop locally

```bash
cd site
npm install
npx quartz build --directory ../content --serve
```

Then open http://localhost:8080.

## Updating content

Edit notes in the Obsidian vault, then re-sync them into `content/` and push. The GitHub Action rebuilds and redeploys automatically.

---

Built with [Quartz](https://quartz.jzhao.xyz/) v4.5.2 (MIT, see `site/LICENSE.txt`). The KJV text is public domain.
