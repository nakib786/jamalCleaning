# Jamal Cleaning Services — website

Website for [Jamal Cleaning Services](https://jmcleaningservice.ca/), rebuilt from the licensed **Cetro** theme
(Home 4 + Services Style 1) as a modern codebase, ready to deploy on Cloudflare.

## Stack and why

- **Astro 7** (static output) + **TypeScript** (strict) + **Tailwind CSS v4**. This is a content site: Astro
  ships plain HTML and CSS, only adds JavaScript where something moves, optimises images at build time
  (AVIF/WebP with `srcset`) and self-hosts the fonts. That gives fast pages and the smallest possible
  Cloudflare footprint (static assets, no server rendering). Next.js would add a React runtime to every page
  and an adapter for Cloudflare without any benefit for this site.
- The theme's jQuery plugins were replaced with **vanilla TypeScript** and two small libraries:
  **Embla Carousel** (sliders), **Lenis** (smooth scrolling, as on the original); entrance animations,
  counters and sticky effects use `IntersectionObserver` and CSS. React is installed for future islands but
  no page needs it today.
- **Cloudflare Workers with static assets** for hosting, with one Worker for the forms (Turnstile spam check
  - Cloudflare Email Service). See [DEPLOY.md](DEPLOY.md).
- ESLint (incl. a11y rules), Prettier and `astro check` run clean (`npm run check`).

## Run it

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # astro check + static build into dist/
npm run preview    # build + Cloudflare `wrangler dev` (forms work), http://localhost:8787
npm run deploy     # build + deploy to Cloudflare (see DEPLOY.md first)
npm run check      # type check (site + worker), lint, format check
```

Node 22+ is required. For local form testing copy `.dev.vars.example` to `.dev.vars` and `.env.example` to `.env`.

## Edit the content

| What                                                                                   | Where                                                                      |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Business name, phone, WhatsApp, email, address, hours, social links, nav, SEO defaults | `src/config/site.ts` (one file; `[PLACEHOLDERS]` stay hidden until filled) |
| Logo, favicons, share image                                                            | replace `src/assets/brand/logo.png`, run `npx tsx tools/assets/brand.ts`   |
| Services (cards, detail pages)                                                         | `src/content/services/*.md`                                                |
| Projects (portfolio)                                                                   | `src/content/projects/*.md`                                                |
| Testimonials (and where each appears)                                                  | `src/content/testimonials.json`                                            |
| FAQs                                                                                   | `src/content/faqs.json`                                                    |
| Page sections                                                                          | `src/components/sections/`, `src/pages/`                                   |

The content schemas (with comments on every field) are in `src/content.config.ts`. Much of the copy, the
counters and the testimonials are still the theme's demo text: replace them with real figures and reviews
before launch.

## Project layout

```text
src/
  assets/            images, icons, fonts (optimised at build time)
  components/
    cards/           ServiceCard, ProjectCard
    forms/           QuoteForm, ContactForm, NewsletterForm
    layout/          Header, TopBar, MobileMenu, SearchDialog, Footer, PageTitle, Logo
    sections/        home/*, testimonials/* (page sections)
    seo/             Seo (meta, Open Graph, JSON-LD)
    ui/              Icon, SectionHeading, Accordion, Marquee
  config/site.ts     brand and contact details
  content/           services, projects, testimonials, FAQs
  layouts/           BaseLayout
  pages/             one file per route (26 pages)
  scripts/           site-wide behaviour, form handling
  styles/global.css  design tokens and shared styles
worker/              Cloudflare Worker for /api/* (forms)
public/              _headers, _redirects, robots.txt, favicons
tools/               crawl/inspect/verify scripts used to rebuild the theme (not deployed)
```

`site-map.md` lists every page of the original demo, the route it became, and what was skipped and why.
