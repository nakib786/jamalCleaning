# Deploying to Cloudflare

The site is a static Astro build served by **Cloudflare Workers with static assets**, which is Cloudflare's
recommended setup for new projects (Pages still works but new features land on Workers first). One small
Worker (`worker/index.ts`) handles the three form endpoints (`/api/quote`, `/api/contact`, `/api/subscribe`);
every other request is served straight from the asset cache without running any code.

| File                           | Purpose                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `wrangler.jsonc`               | Worker + assets config (404 page, trailing slashes, email binding, vars)     |
| `worker/index.ts`              | Form handler: validation, honeypot, Turnstile check, email via Email Service |
| `public/_headers`              | Security headers (CSP, HSTS, …) and cache rules                              |
| `public/_redirects`            | Path redirects (old URLs, short URLs)                                        |
| `.dev.vars.example`            | Local secrets template for `wrangler dev`                                    |
| `.env.example`                 | Build-time public values (Turnstile site key)                                |
| `.github/workflows/deploy.yml` | Optional: build and deploy on every push to `main`                           |

Limits: the build is ~380 files and no file is over 1 MB; Workers static assets allow 20,000 files and
25 MiB per file.

## 1. Install and log in

```sh
npm install
npx wrangler login      # opens the browser; pick the Cloudflare account that will host the site
npx wrangler whoami     # check you are on the right account
```

If your login can see several accounts, add `"account_id": "<id>"` to `wrangler.jsonc` (or set the
`CLOUDFLARE_ACCOUNT_ID` environment variable) so deploys always go to the right one.

## 2. Try it locally

```sh
cp .dev.vars.example .dev.vars   # Turnstile test secret, never commit .dev.vars
cp .env.example .env             # Turnstile test site key
npm run dev                      # Astro dev server, http://localhost:4321 (forms need the Worker, see below)
npm run preview                  # production build + `wrangler dev`, http://localhost:8787 (forms work)
```

In `wrangler dev` emails are not sent: Wrangler writes each message to `.wrangler/tmp/email/` and prints
the path, so you can check the content.

## 3. Turnstile (spam protection)

1. Cloudflare dashboard → **Turnstile** → **Add widget**. Hostnames: `jmcleaningservice.ca`,
   `www.jmcleaningservice.ca` and your `*.workers.dev` hostname. Widget mode: **Managed**.
2. Put the **site key** in `.env` as `PUBLIC_TURNSTILE_SITE_KEY=…` (and in the GitHub variable of the same
   name if you use the workflow). It is public and ends up in the page.
3. Store the **secret key** in the Worker (you'll be prompted for the value; don't paste it into a command):

   ```sh
   npx wrangler secret put TURNSTILE_SECRET_KEY
   ```

## 4. Email (form submissions)

Submissions are emailed with **Cloudflare Email Service** through the `send_email` binding, so there are no
API keys. The sender must be on a domain that is onboarded to Email Sending:

```sh
npx wrangler email sending enable jmcleaningservice.ca   # adds the SPF/DKIM DNS records (domain must be on Cloudflare)
npx wrangler email sending list                          # check it is enabled
```

Then set the addresses in `wrangler.jsonc` → `vars`:

- `EMAIL_TO`: who receives submissions (comma-separate several addresses)
- `EMAIL_FROM`: the sender, e.g. `website@jmcleaningservice.ca` (any address on the onboarded domain)

Replies go straight to the visitor (the Worker sets `Reply-To` to the address they entered).

## 5. First deploy

```sh
npm run deploy           # astro check + build, then `wrangler deploy`
```

Wrangler prints the `https://jamal-cleaning-site.<subdomain>.workers.dev` URL. Test every page and send each
form once. To test a change without touching the live site, upload a version instead; it gets its own
preview URL:

```sh
npm run deploy:preview   # build + `wrangler versions upload`
```

## 6. Custom domain ([YOUR DOMAIN] = jmcleaningservice.ca)

1. Add the domain to Cloudflare (dashboard → **Add a domain**) and switch its nameservers at the registrar.
   Wait until the dashboard shows it as **Active**.
2. In `wrangler.jsonc`, uncomment the `routes` block (both `jmcleaningservice.ca` and
   `www.jmcleaningservice.ca` as `custom_domain`) and run `npm run deploy` again. Cloudflare creates the DNS
   records and certificates. (Dashboard alternative: **Workers & Pages** → the Worker → **Settings** →
   **Domains & Routes** → **Add** → **Custom domain**.)
3. **www → apex redirect:** dashboard → the domain → **Rules** → **Redirect Rules** → **Create rule** →
   template **“Redirect from WWW to root”** (301, keep the path and query string).
4. Check `https://www.jmcleaningservice.ca/about-us` → `https://jmcleaningservice.ca/about-us/`.
5. Optional: once everything works, set `"workers_dev": false` in `wrangler.jsonc` so the site is only
   reachable on the real domain.

## 7. Secrets and settings at a glance

| Name                        | Where                                             | Notes                      |
| --------------------------- | ------------------------------------------------- | -------------------------- |
| `TURNSTILE_SECRET_KEY`      | `wrangler secret put` (prod), `.dev.vars` (local) | Secret                     |
| `PUBLIC_TURNSTILE_SITE_KEY` | `.env` / GitHub variable                          | Public, read at build time |
| `EMAIL_TO`, `EMAIL_FROM`    | `wrangler.jsonc` → `vars`                         | Not secret                 |
| `CLOUDFLARE_API_TOKEN`      | GitHub secret                                     | Only for the workflow      |
| `CLOUDFLARE_ACCOUNT_ID`     | GitHub secret                                     | Only for the workflow      |

```sh
npx wrangler secret list        # names of the secrets set on the Worker (values are never shown)
```

## 8. Roll back

Every deploy is a version, and rolling back is instant:

```sh
npx wrangler deployments list   # recent deployments
npx wrangler rollback           # back to the previous version (asks for confirmation)
npx wrangler rollback <VERSION_ID>
```

Or in the dashboard: the Worker → **Deployments** → pick a version → **Rollback**.

## 9. Automatic deploys (optional)

`.github/workflows/deploy.yml` builds and deploys on every push to `main` (and on demand from the Actions tab).
In the GitHub repo → **Settings** → **Secrets and variables** → **Actions**, add:

- secret `CLOUDFLARE_API_TOKEN`: create it in the Cloudflare dashboard → **My Profile** → **API Tokens** →
  template **“Edit Cloudflare Workers”**
- secret `CLOUDFLARE_ACCOUNT_ID`: shown on the account's overview page
- variable `PUBLIC_TURNSTILE_SITE_KEY`: the Turnstile site key

### Cloudflare Workers Builds (dashboard Git integration)

If the repository is connected in the dashboard (Worker → **Settings** → **Builds**), Cloudflare builds and deploys on its own, so the GitHub Action above is not needed and its deploy step stays skipped unless you add the token secret. Use one or the other, not both. The settings that work with this repo:

| Setting                                 | Value                  |
| --------------------------------------- | ---------------------- |
| Build command                           | `npm run build`        |
| Deploy command (production branch)      | `npx wrangler deploy`  |
| Deploy command (other branches and PRs) | `npx wrangler preview` |

`wrangler preview` needs the `previews` block in `wrangler.jsonc` (already there). Previews only ever email the testing address; change that block deliberately if previews should email someone else. A preview Worker has no `TURNSTILE_SECRET_KEY` unless you add one (`npx wrangler preview secret put TURNSTILE_SECRET_KEY`), so forms on a preview URL will not verify until you do.

## 10. Logs

```sh
npx wrangler tail               # live logs from the form Worker (errors from email or Turnstile show here)
```

Observability is enabled in `wrangler.jsonc`, so logs are also kept in the dashboard (Worker → **Logs**).
