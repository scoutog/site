# scout-og.com

Minimal static site + GitHub Pages deployment.

## Local files
- `index.html` - Hello World page
- `CNAME` - custom domain for GitHub Pages (`scout-og.com`)
- `.github/workflows/deploy.yml` - deploys on push to `main`

## Deploy
1. Create an empty GitHub repo (for example: `site`).
2. Add your remote and push:
   - `git remote add origin https://github.com/<your-username>/site.git`
   - `git add .`
   - `git commit -m "Initial hello world site"`
   - `git push -u origin main`
3. In GitHub repo settings, open **Pages** and set **Source** to **GitHub Actions**.
4. Wait for the **Deploy static site to GitHub Pages** workflow to finish.

## DNS records for `scout-og.com`
Create these DNS records at your domain registrar:

- `A` record, host `@` -> `185.199.108.153`
- `A` record, host `@` -> `185.199.109.153`
- `A` record, host `@` -> `185.199.110.153`
- `A` record, host `@` -> `185.199.111.153`
- `CNAME` record, host `www` -> `scout-og.com`

Then in GitHub Pages custom domain settings, set domain to `scout-og.com` and enable HTTPS.

DNS propagation can take a few minutes up to 24 hours.