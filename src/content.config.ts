/**
 * Typed content (services, projects, testimonials, FAQs). Pages render these
 * collections, so text and images are edited here rather than in markup.
 *
 * Service and project detail pages follow a fixed layout (feature grid, photo pair,
 * checklist, FAQ / fact sheet), so their content is structured frontmatter rather
 * than free-form Markdown. Each block is optional: leave it out and the page skips it.
 */
import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

/** Icons available for service feature boxes (src/assets/images/misc/icons/<name>.svg). */
export const FEATURE_ICONS = [
  "deep-cleaning",
  "comprehensive-cleaning",
  "eco-friendly",
  "flexible-scheduling",
  "house-cleaning",
  "office-cleaning",
  "store-cleaning",
] as const;

const textBlock = z.object({
  heading: z.string(),
  paragraphs: z.array(z.string()).default([]),
});

/** Services — one Markdown file per service in src/content/services/ (file name = URL slug). */
const services = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/services" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Display order (home page stack, services grid, menus, quote form). */
      order: z.number(),
      /** Short description used on cards and the home page stack. */
      excerpt: z.string(),
      /** Main photo (cards, home page stack, detail page). */
      image: image(),
      imageAlt: z.string(),
      /** Meta description override for the detail page. */
      seoDescription: z.string().optional(),
      /**
       * One or two plain sentences that answer "what is this service, and who provides it?" on their own.
       * Shown at the top of the detail page and used as the Service description in structured data, so
       * search and AI answer engines can quote it.
       */
      quickAnswer: z.string().optional(),

      /** Detail page: intro text under the main photo. */
      about: textBlock.optional(),
      /** Detail page: 2×2 feature boxes after the intro. */
      features: z
        .array(z.object({ title: z.string(), text: z.string(), icon: z.enum(FEATURE_ICONS) }))
        .default([]),
      /** Detail page: photo pair after the features. */
      gallery: z.array(z.object({ src: image(), alt: z.string() })).default([]),
      /** Detail page: further text sections; a section may end with a two-column checklist and a note. */
      sections: z
        .array(
          textBlock.extend({
            checklist: z.array(z.string()).default([]),
            note: z.string().optional(),
          }),
        )
        .default([]),
      /** Detail page: accordion at the end. */
      faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
    }),
});

/** Projects (portfolio) — one Markdown file per project in src/content/projects/ (file name = URL slug). */
const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Display order (newest first: 1 = first card). */
      order: z.number(),
      /** Category shown on cards and breadcrumbs, used by the /projects/ filter. */
      category: z.string(),
      excerpt: z.string(),
      image: image(),
      imageAlt: z.string(),
      seoDescription: z.string().optional(),

      /** Detail page fact sheet. */
      completed: z.string().optional(),
      client: z.string().optional(),
      location: z.string().optional(),
      /** Fact-sheet category; defaults to `category`. */
      factCategory: z.string().optional(),

      /** Detail page: first text block; the photo pair sits between its first and second paragraph. */
      overview: textBlock.optional(),
      gallery: z.array(z.object({ src: image(), alt: z.string() })).default([]),
      benefits: textBlock.extend({ list: z.array(z.string()).default([]) }).optional(),
      review: textBlock.extend({ quote: z.string(), author: z.string() }).optional(),
    }),
});

/** Client testimonials (home page, testimonials page, about page). */
const testimonials = defineCollection({
  loader: file("src/content/testimonials.json"),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string().default(""),
      quote: z.string(),
      /** 0 hides the stars. */
      rating: z.number().min(0).max(5).default(5),
      avatar: image().optional(),
      /**
       * Where the testimonial appears: "list" = home page / testimonials page list (photo panel beside it),
       * "slider" = testimonials page slider, "cards" = card carousel (testimonials and about pages).
       */
      placements: z.array(z.enum(["list", "slider", "cards"])).default([]),
      /** Display order. */
      order: z.number().default(0),
      /**
       * True for stand-in testimonials that are not from real customers. `npm run verify:links` warns
       * about every one that is still on the site: replace them before launch, and never add review
       * structured data (AggregateRating / Review) while any placeholder remains.
       */
      placeholder: z.boolean().default(false),
    }),
});

/** Frequently asked questions (FAQs page). */
const faqs = defineCollection({
  loader: file("src/content/faqs.json"),
  schema: z.object({
    question: z.string(),
    answer: z.string(),
    group: z.string().default("General"),
    order: z.number().default(0),
  }),
});

export const collections = { services, projects, testimonials, faqs };
