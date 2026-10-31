/**
 * Typed content (services, projects, testimonials, FAQs). Pages render these
 * collections, so text and images are edited here rather than in markup.
 */
import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

/** Services — one Markdown file per service; the body is the detail page article. */
const services = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/services" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Display order (home page stack, services grid, menus). */
      order: z.number(),
      /** Short description used on cards and the home page stack. */
      excerpt: z.string(),
      /** Main photo (cards, home page stack, detail hero). */
      image: image(),
      imageAlt: z.string().default(""),
      /** Optional theme icon name (see src/components/ui/icons.generated.ts). */
      icon: z.string().optional(),
      /** Extra photos shown on the detail page. */
      gallery: z.array(image()).default([]),
      /** Meta description override for the detail page. */
      seoDescription: z.string().optional(),
    }),
});

/** Projects (portfolio) — one Markdown file per project; the body is the case study. */
const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      order: z.number(),
      /** Primary category, shown on cards and used by the filter. */
      category: z.string(),
      categories: z.array(z.string()).default([]),
      excerpt: z.string(),
      image: image(),
      imageAlt: z.string().default(""),
      gallery: z.array(image()).default([]),
      /** Project facts shown in the detail sidebar. */
      client: z.string().optional(),
      location: z.string().optional(),
      date: z.string().optional(),
      duration: z.string().optional(),
      seoDescription: z.string().optional(),
    }),
});

/** Client testimonials (home page, testimonials page). */
const testimonials = defineCollection({
  loader: file("src/content/testimonials.json"),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string().default(""),
      quote: z.string(),
      rating: z.number().min(1).max(5).default(5),
      avatar: image().optional(),
    }),
});

/** Frequently asked questions (FAQs page, service pages). */
const faqs = defineCollection({
  loader: file("src/content/faqs.json"),
  schema: z.object({
    question: z.string(),
    answer: z.string(),
    group: z.string().default("General"),
  }),
});

export const collections = { services, projects, testimonials, faqs };
