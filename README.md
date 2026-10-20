# Holy Bible - Obsidian Study Guide

A published, fully interlinked Bible study vault — 1,139 notes covering all 66 canonical books (KJV), plus people, places, events, themes, and timelines. Authored in [Obsidian](https://obsidian.md) and published as a static site with [Quartz 4](https://quartz.jzhao.xyz/).

## Last updated

**October 19, 2026** · 1,139 notes

Latest changes: added the Words of Christ hub (2,029 red-letter sayings), gave the Father, Son, and Holy Spirit their own Holy Trinity folder, and highlighted Christ's words inline in the New Testament KJV source text.

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

Edit notes in the Obsidian vault (the `Bible-Vault` repo), then run `scripts/sync_to_guide.sh` there. It mirrors `Bible/` into this repo's `content/`. Review the diff here, then commit and push. The GitHub Action rebuilds and redeploys automatically.

---

Built with [Quartz](https://quartz.jzhao.xyz/) v4.5.2 (MIT, see `site/LICENSE.txt`). The KJV text is public domain.
