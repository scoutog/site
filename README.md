# Scout Site (`scout-og.com`)

Static website hosted on GitHub Pages.

## Live Site
- Primary domain: `https://scout-og.com`

## Current Pages
- `index.html` - Daily Brief landing page
- `projects/snake.html` - Playable Snake game
- `projects/project-02.html` to `projects/project-06.html` - Placeholder project pages
- `styles.css` - Shared site styling
- `CNAME` - Custom domain configuration (`scout-og.com`)

## Daily Brief Features
- Date, moon phase, and ZIP-based local weather
- 24-hour weather chart (temperature, conditions, precipitation)
- Top stories feed
- On This Day fact
- SAT-style Word of the Day
- XKCD daily comic
- Market Snapshot (SPY, VOO, NKE) with 1D change and Yahoo Finance detail links

## Snake Features
- Keyboard controls: Arrow keys / WASD
- Game starts on first movement key
- Restart support and best-score persistence (`localStorage`)
- Predefined color swatch selectors for snake and food

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
