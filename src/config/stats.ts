/**
 * Every figure the site shows about the business, in one place: the counters on the Home and
 * About pages and the "Ratings" card beside the testimonials.
 *
 * TODO(client): NONE OF THESE ARE REAL. They came with the theme's demo content and contradict each
 * other ("299K Satisfaction Rate" above "Over 250 successful projects", "364+ Skilled Tradespeople"
 * above "Our team of 30 experts", "586k Clients globally" beside "199+ Happy Clients"). Replace each
 * `value`, `suffix`, `title` and `text` with figures the owner can stand behind, or delete an entry
 * to remove that counter. Do not publish rating markup (schema.org AggregateRating) for the rating
 * below unless it is the business's real review score.
 *
 * `npm run verify:links` keeps warning about these until the demo wording is gone.
 */
export interface Counter {
  /** The number that counts up when it scrolls into view. */
  value: number;
  /** Printed right after the number: "+", "K", "%" or "". */
  suffix: string;
  title: string;
  text: string;
}

/** Home page, under "Why will you choose our services?" (src/components/sections/home/WhyChoose.astro). */
export const homeCounters: Counter[] = [
  {
    value: 246,
    suffix: "+",
    title: "Cleaning Experts",
    text: "Keeping stores, offices and commercial buildings clean",
  },
  {
    value: 299,
    suffix: "K",
    title: "Satisfaction Rate",
    text: "Over 250 successful projects delivered with quality and care",
  },
  {
    value: 364,
    suffix: "+",
    title: "Skilled Tradespeople",
    text: "Our team of 30 experts ensures top-quality results",
  },
  {
    value: 199,
    suffix: "+",
    title: "Happy Clients",
    text: "All of our clients are satisfied with our work and service",
  },
];

/** About page, dark "Smart cleaning solution" band (src/pages/about-us.astro). */
export const aboutCounters: Counter[] = [
  {
    value: 299,
    suffix: "k",
    title: "Successful Projects",
    text: "Over 250 successful projects delivered with quality and care",
  },
  {
    value: 364,
    suffix: "+",
    title: "Skilled Tradespeople",
    text: "Our team of 30 experts ensures top-quality results",
  },
  {
    value: 199,
    suffix: "+",
    title: "Happy Clients",
    text: "All of our clients are satisfied with our work and service",
  },
];

/** Card on the photo panel beside the testimonials (src/components/sections/testimonials/TestimonialPanel.astro). */
export const ratingsCard = {
  heading: "Ratings 4.5",
  text: "Clients praise our exceptional work.",
  clients: "586k Clients globally",
};
