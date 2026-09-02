# Scout Site (`scout-og.com`)

Static website hosted on GitHub Pages.

## Live Site
- Primary domain: `https://scout-og.com`

## Current Pages
- `index.html` - Scout landing page
- `snake.html` - Playable Snake game
- `crime.html` - County Crime Atlas
- `running.html` - Private running-progress dashboard
- `styles.css` - Shared site styling
- `CNAME` - Custom domain configuration (`scout-og.com`)

## Landing Page Features
- Date, moon phase, and ZIP-based local weather
- 24-hour weather chart (temperature, conditions, precipitation)
- Top stories feed
- On This Day fact
- XKCD daily comic
- Market Snapshot (VOO, QQQM, NKE, RKLB) with 1D change and Yahoo Finance detail links

## Snake Features
- Keyboard controls: Arrow keys / WASD
- Game starts on first movement key
- Restart support and best-score persistence (`localStorage`)
- Predefined color swatch selectors for snake and food

## Running Dashboard
- Static private dashboard at `https://scout-og.com/running.html`
- Supabase password authentication using one fixed account
- Postgres storage with row-level security migrations in `supabase/migrations`
- Health Auto Export ingestion Edge Function in `supabase/functions/import-health-data`
- Notes, deletion controls, Health Auto Export ingestion, and responsive Chart.js views
- Setup guide: `docs/running-dashboard.md`

## Local Validation
Use the bundled or system Node runtime:

```sh
node --test
node scripts/validate-static-site.js
```

## Deployment
GitHub Actions deploys on push to `master` via:
- `.github/workflows/deploy.yml`

Steps:
1. Push changes to `master`.
2. GitHub Actions runs `Deploy static site to GitHub Pages`.
3. GitHub Pages publishes the site.

## DNS / Domain
For apex + `www` setup:
- `A` record `@` -> `185.199.108.153`
- `A` record `@` -> `185.199.109.153`
- `A` record `@` -> `185.199.110.153`
- `A` record `@` -> `185.199.111.153`
- `CNAME` record `www` -> `scout-og.com`

If using Cloudflare with GitHub Pages, keep these records as `DNS only` (not proxied) to avoid resolution/certificate issues.
