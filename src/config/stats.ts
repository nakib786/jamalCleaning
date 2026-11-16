/**
 * Every figure the site shows about the business, in one place: the counters on the Home and
 * About pages and the card beside the testimonials.
 *
 * Owner's figures (2026-11-15, the business's first year): 20+ cleaners, 50+ clients served,
 * 100+ jobs completed. Each is a floor ("+"), so raise them as the business grows; never round up
 * past what is true. "24/7" repeats the working hours in src/config/site.ts.
 *
 * The card shows no star rating on purpose: add one only once it is the business's real Google
 * score, and never publish rating markup (schema.org AggregateRating) for anything else.
 */
export interface Counter {
  /** The number that counts up when it scrolls into view. */
  value: number;
  /** Printed right after the number: "+", "/7", "%" or "". */
  suffix: string;
  title: string;
  text: string;
}

const cleaners: Counter = {
  value: 20,
  suffix: "+",
  title: "Trained Cleaners",
  text: "Our crew keeps stores, offices and commercial buildings clean",
};

const clients: Counter = {
  value: 50,
  suffix: "+",
  title: "Clients Served",
  text: "Businesses and homes across Prince George in our first year",
};

const jobs: Counter = {
  value: 100,
  suffix: "+",
  title: "Jobs Completed",
  text: "Every job done to a written checklist, with care",
};

const allHours: Counter = {
  value: 24,
  suffix: "/7",
  title: "Cleaning Available",
  text: "Overnight and after-hours cleaning, seven days a week",
};

/** Home page, under "Why will you choose our services?" (src/components/sections/home/WhyChoose.astro). */
export const homeCounters: Counter[] = [cleaners, clients, jobs, allHours];

/** About page, dark "Smart cleaning solution" band (src/pages/about-us.astro). */
export const aboutCounters: Counter[] = [jobs, cleaners, clients];

/** Card on the photo panel beside the testimonials (src/components/sections/testimonials/TestimonialPanel.astro). */
export const ratingsCard = {
  heading: "Proudly local",
  text: "Trusted by Prince George businesses and homes.",
  clients: "50+ local clients",
};
