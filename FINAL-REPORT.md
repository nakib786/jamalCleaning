# Jamal Cleaning Services website: handover report

**Status:** built and tested, **not live yet**. A few things below need you (real content and the go-live steps) before it can launch.

## What was built

A fast, mobile-friendly 26-page website for Jamal Cleaning Services, hosted on Cloudflare:

- **Home**, **About Us**, **Contact Us**, **FAQs**, **Testimonials**, and a friendly **404** page
- **Services**: an overview page plus 6 service pages (Regular Home, Residential, Move In/Out, Construction, Skilled/Deep, Specialized)
- **Projects**: a filterable gallery plus 12 project pages
- **Forms** (quote request, contact, newsletter) that email you, protected against spam by Cloudflare Turnstile
- **WhatsApp first**: a floating "Chat with us" WhatsApp button on every page, plus WhatsApp in the header, menu, home hero, service pages, Contact page and footer. Chats open with a ready-made first message (naming the service on service pages)
- Search-engine basics (page titles, descriptions, sitemap, robots.txt). On phones the top bar shows WhatsApp and the phone number, and the menu has WhatsApp, call, email and Get a Quote buttons

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

- **Testimonials**: all 13 are stand-ins for now (kept at your request): the original demo ones ("Dishes Cleaning", "Ariana Green") plus 7 added with varied names. Each is marked `"placeholder": true` in `src/content/testimonials.json`, and `npm run verify:links` warns about every one still on the site. Replace them with real customer reviews before launch. Publishing invented reviews as real can breach Canadian consumer-protection law (Competition Act) and Google's review policies, and the site deliberately carries no star-rating markup until real reviews exist. If you have none yet, we can hide the testimonial sections instead.
- **Numbers**: "Ratings 4.5" and "586k Clients globally" (Home and Testimonials pages) and the counters and their captions on the Home and About pages ("246+ Cleaning Experts", "team of 30 experts", "over 250 projects" and so on). Only use figures that are true.
- **Project photos**: the 12 project pages use the template's stock photos, and several do not match their titles (for example "Solar Panel Cleaning" shows window cleaning). Swap in photos of your own work.
- **Address and social links**: street address, postal code, and Facebook/Instagram/LinkedIn links are still placeholders in `src/config/site.ts` (hidden on the site until filled in).

**2. Please read the wording we drafted.** The service, project and FAQ pages previously held repeated demo text (including interior-design copy). They now have plain descriptions of each service. We avoided prices, years in business and specific job claims, but you should confirm the statements are true for you, especially: eco-friendly products, overnight cleaning, "no need to be home", how you handle rescheduling, and what the kitchen-hood service covers (hoods, filters and accessible surfaces only).

**3. Going live** (steps are in `DEPLOY.md`):

- Form emails currently go to **n@aurorabusiness.ca**, the testing address (left as is for now, by your choice). Before launch, change `EMAIL_TO` and the `send_email` address in `wrangler.jsonc` to the address where you want enquiries (it must be verified in Cloudflare Email Routing).
- Set the Turnstile secret key, connect `jmcleaningservice.ca`, set up the www-to-main-site redirect, then send a test of each form.
- Nothing has been deployed without your go-ahead.

## Search and AI visibility (AEO)

What is built in, so Google and AI assistants (ChatGPT, Perplexity, Gemini, Claude) can find and quote the business accurately:

- **Structured data** on every page: the business (name, phone, hours, location, services offered), plus `Service` and `FAQPage` markup on each service page, `FAQPage` on the FAQs page, `WebSite` on Home, and `AboutPage` / `ContactPage` / breadcrumb markup. It only describes text that is visible on the page. We removed an invented price range (`$$`) that was in the markup.
- **A "Quick answer" box** at the top of every service page: one or two plain sentences that define the service and say how to book, written so they can be quoted word for word.
- **Question-and-answer FAQs** (the FAQs page and each service page) with direct, short answers.
- **`/llms.txt`**: a plain-text summary of the business, services and FAQs for AI assistants. It is generated from the site content, so it stays in sync. (This file is still an emerging convention and not proven to matter; it costs nothing.)
- **`robots.txt`** explicitly welcomes search and AI answer-engine crawlers (OpenAI search, Perplexity, Claude, Google, Bing, Apple) and only blocks the form endpoints. It also shows how to opt out of AI _training_ crawlers while staying in AI _search_, if you ever want that.
- A fast, mobile-friendly, plain-HTML site, which AI crawlers read easily.

## What else the business needs to be found and chosen (market trends)

Industry guides for 2026 agree that AI answers build on local search, so most of the remaining wins happen outside the website. In priority order:

1. **Google Business Profile** (the biggest single lever, and what Google's AI answers and Maps use): claim and verify it, pick the right categories (for example "House cleaning service"), set Prince George as the service area, add hours, services, real photos, weekly posts, and link it to this site.
2. **Reviews, steadily and honestly**: ask every customer for a Google review (a short link or QR code on invoices and after each job) and reply to all of them. Many guides cite a 4+ star rating as the threshold customers look for. Never buy or invent reviews. Once real reviews exist, we add star-rating markup.
3. **Same name, address and phone everywhere**: Bing Places (industry guides report that ChatGPT's search draws on Bing), Apple Business Connect, Facebook, and the main Canadian directories.
4. **Submit the sitemap** (`https://jmcleaningservice.ca/sitemap-index.xml`) in Google Search Console and Bing Webmaster Tools after launch.
5. **Check Cloudflare is not blocking AI crawlers** once the domain is on Cloudflare (dashboard, Security, Bots: the "AI bots" / "Block AI bots" setting and the managed robots.txt option). Cloudflare can block them by default even when `robots.txt` allows them.
6. **Trust signals, if true**: insurance, WCB coverage, bonding, background-checked staff. Tell us what is accurate and we will add it to the site and the structured data.
7. **Easier booking**: an online booking request or instant-estimate form is now the norm for home-cleaning sites. The quote form and click-to-call exist today; an estimate calculator needs your pricing rules, so it is a good next feature.
8. **Real photos and local content**: photos of your real crews and jobs, plus a few pages answering the questions people actually ask ("How much does a deep clean cost in Prince George?", "What should I do before a move-out clean?"). You chose no blog, so these would be regular pages.
9. **Measure it**: privacy-friendly analytics (for example Cloudflare Web Analytics) once live. None is installed.

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
