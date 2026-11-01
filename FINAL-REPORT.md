# Jamal Cleaning Services website: handover report

**Status:** built and tested, **not live yet**. A few things below need you (real content and the go-live steps) before it can launch.

## What was built

A fast, mobile-friendly 26-page website for Jamal Cleaning Services, hosted on Cloudflare:

- **Home**, **About Us**, **Contact Us**, **FAQs**, **Testimonials**, and a friendly **404** page
- **Services**: an overview page plus 6 service pages (Regular Home, Residential, Move In/Out, Construction, Skilled/Deep, Specialized)
- **Projects**: a filterable gallery plus 12 project pages
- **Forms** (quote request, contact, newsletter) that email you, protected against spam by Cloudflare Turnstile
- Search-engine basics (page titles, descriptions, sitemap, robots.txt) and a phone/WhatsApp bar on mobile

Contact details, hours, address and social links are all set in one file (`src/config/site.ts`). Text for services, projects, FAQs and testimonials lives in `src/content/`.

## Quality checks (latest results)

| Check                              | Result                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Google Lighthouse (mobile)         | Performance 94–100; Accessibility, Best Practices and SEO all 100 on every key page                |
| Accessibility scan (WCAG 2.2 AA)   | 0 problems on all 26 pages at desktop and phone width                                              |
| Links, images and files            | 254 internal links/files checked, none broken; no leftover demo-site references or console errors  |
| Phone (390 px) and tablet (768 px) | All 26 pages checked for sideways overflow and reviewed visually; fixed one About-page photo issue |

## What still needs you before launch

**1. Real content.** These were copied from the template and are not real information about your business. They must be replaced, not published:

- **Testimonials**: the names ("Dishes Cleaning", "Ariana Green"), roles, photos and quotes are demo content. Replace them with real customer reviews (`src/content/testimonials.json`). If you have none yet, tell us and we will hide the testimonial sections.
- **Numbers**: "Ratings 4.5" and "586k Clients globally" (Home and Testimonials pages) and the counters and their captions on the Home and About pages ("246+ Cleaning Experts", "team of 30 experts", "over 250 projects" and so on). Only use figures that are true.
- **Project photos**: the 12 project pages use the template's stock photos, and several do not match their titles (for example "Solar Panel Cleaning" shows window cleaning). Swap in photos of your own work.
- **Address and social links**: street address, postal code, and Facebook/Instagram/LinkedIn links are still placeholders in `src/config/site.ts` (hidden on the site until filled in).

**2. Please read the wording we drafted.** The service, project and FAQ pages previously held repeated demo text (including interior-design copy). They now have plain descriptions of each service. We avoided prices, years in business and specific job claims, but you should confirm the statements are true for you, especially: eco-friendly products, overnight cleaning, "no need to be home", how you handle rescheduling, and what the kitchen-hood service covers (hoods, filters and accessible surfaces only).

**3. Going live** (steps are in `DEPLOY.md`):

- Form emails currently go to **n@aurorabusiness.ca**, the testing address. Change `EMAIL_TO` and the `send_email` address in `wrangler.jsonc` to the address where you want enquiries (it must be verified in Cloudflare Email Routing).
- Set the Turnstile secret key, connect `jmcleaningservice.ca`, set up the www-to-main-site redirect, then send a test of each form.
- Nothing has been deployed without your go-ahead.

## Known limits

- The full archive of the reference demo (`npm run crawl:capture`) was not finished. It does not affect the website.
- A side-by-side pixel comparison against the original demo (`npm run verify`) is built and tested, but could not be run in the last session because the demo site was not reachable from the build environment. Two small differences on Home are already known: at tablet width the "why choose" photo cards are about 10 px taller, and at phone width one intro paragraph wraps to 5 lines instead of 6.

## Re-running the checks

```sh
npm run check             # types, code style, lint
npm run preview           # production build served on http://localhost:8787
npm run verify:a11y       # accessibility scan, all pages
npm run verify:links      # links, assets, demo leftovers, console errors
npm run verify:responsive # phone and tablet layout + screenshots
npm run verify            # side-by-side against the original demo (needs internet access to it)
```

Set `CHROME_PATH` to a Chrome/Chromium binary if Playwright's own browser is not installed.
