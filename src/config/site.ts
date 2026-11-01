/**
 * Brand & site configuration — edit this one file to change the business details
 * shown across the whole site (header, footer, contact blocks, SEO, structured data).
 *
 * Values in [SQUARE BRACKETS] are placeholders. Links whose value is still a
 * placeholder are hidden automatically (see `isSet`), so the site never shows a
 * broken link while you fill them in.
 */
import type { ImageMetadata } from "astro";
import logoFull from "../assets/brand/logo-full.png";
import logoOnDark from "../assets/brand/logo-on-dark.png";
import ogImage from "../assets/brand/og-image.jpg";

export interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

export const site = {
  name: "Jamal Cleaning Services",
  shortName: "Jamal Cleaning",
  /** Canonical origin, no trailing slash. Keep in sync with `site` in astro.config.mjs. */
  url: "https://jmcleaningservice.ca",
  tagline: "Clean space starts here",
  description:
    "Professional residential, commercial, office, window and deep cleaning services across Prince George, BC. Open 7 days a week — get a free quote today.",
  /** Short "about" blurb used in the footer. */
  about:
    "Professional cleaning for homes, offices and commercial spaces across Prince George — done right, every time.",

  /**
   * Logos are generated from src/assets/brand/logo.png by `npx tsx tools/assets/brand.ts`
   * (trimmed full logo, a white-wordmark version for dark backgrounds, favicons, share image).
   * To change the logo, replace logo.png and re-run that script.
   */
  logo: {
    /** Full logo for light backgrounds. */
    src: logoFull satisfies ImageMetadata,
    /** Full logo with a white wordmark for dark backgrounds (header over photos, footer). */
    onDark: logoOnDark satisfies ImageMetadata,
    alt: "Jamal Cleaning Services",
  },

  contact: {
    phone: { display: "(236) 331-7323", href: "tel:+12363317323", e164: "+12363317323" },
    whatsapp: "https://wa.me/12363317323",
    email: "info@jmcleaningservice.ca",
    address: {
      street: "[STREET ADDRESS]",
      locality: "Prince George",
      region: "BC",
      postalCode: "[POSTAL CODE]",
      country: "CA",
      /** One-line address for the top bar and footer. */
      short: "Prince George, BC, Canada",
      geo: { latitude: 53.9171, longitude: -122.7497 },
      /** Link for "get directions" and the map embed on the contact page. */
      mapUrl: "https://maps.app.goo.gl/D7ibhfUKgzgssFM79",
      mapEmbedUrl: "https://www.google.com/maps?q=Prince%20George%2C%20BC&output=embed",
    },
    hours: {
      /** Top bar line. */
      short: "Open 7 days a week · overnight cleaning available",
      /** Footer "Working Time" rows. */
      rows: [
        { label: "Mon - Fri", value: "24 hours" },
        { label: "Saturday", value: "24 hours" },
        { label: "Sunday", value: "24 hours" },
      ],
      /** schema.org openingHours (all week, overnight included). */
      schema: {
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        opens: "00:00",
        closes: "23:59",
      },
    },
  },

  social: {
    facebook: "[FACEBOOK URL]",
    x: "[X / TWITTER URL]",
    instagram: "[INSTAGRAM URL]",
    linkedin: "[LINKEDIN URL]",
  },

  /** Primary call to action (header button, banners). */
  quote: { label: "Get a Quote!", href: "/contact-us/" },

  nav: [
    { label: "Home", href: "/" },
    {
      label: "Services",
      href: "/services/",
      children: [
        { label: "All Services", href: "/services/" },
        { label: "Residential Services", href: "/services/residential-services/" },
        { label: "Regular Home Cleaning", href: "/services/regular-home-cleaning/" },
        { label: "Move In Out Cleaning", href: "/services/move-in-out-cleaning/" },
        { label: "Construction Cleaning", href: "/services/construction-cleaning/" },
        { label: "Specialized Cleaning", href: "/services/specialized-cleaning/" },
        { label: "Skilled Cleaning", href: "/services/skilled-cleaning/" },
      ],
    },
    { label: "Projects", href: "/projects/" },
    {
      label: "Company",
      href: "/about-us/",
      children: [
        { label: "About Us", href: "/about-us/" },
        { label: "Testimonials", href: "/testimonials/" },
        { label: "FAQs", href: "/faqs/" },
      ],
    },
    { label: "Contact Us", href: "/contact-us/" },
  ] satisfies NavItem[],

  footerNav: [
    { label: "About Us", href: "/about-us/" },
    { label: "Services", href: "/services/" },
    { label: "Projects", href: "/projects/" },
    { label: "FAQs", href: "/faqs/" },
    { label: "Contact Us", href: "/contact-us/" },
  ] satisfies NavItem[],

  seo: {
    titleTemplate: "%s | Jamal Cleaning Services",
    defaultTitle: "Jamal Cleaning Services | Cleaning Company in Prince George, BC",
    /** Default social share image (1200×630). */
    ogImage: ogImage satisfies ImageMetadata,
    ogImageAlt: "Jamal Cleaning Services — professional cleaning in Prince George, BC",
    locale: "en_CA",
    twitterHandle: "[@TWITTER HANDLE]",
    keywords: [
      "cleaning services Prince George",
      "commercial cleaning Prince George",
      "house cleaning Prince George BC",
      "move out cleaning Prince George",
      "post-construction cleaning",
    ],
  },

  /** Footer credit. */
  developer: { name: "Aurora N&N Business Solution Inc.", url: "https://aurorabusiness.ca" },
} as const;

/** True when a config value has been filled in (not a [PLACEHOLDER] or empty). */
export function isSet(value: string | undefined | null): value is string {
  return Boolean(value) && !/^\[.*\]$/.test(value?.trim() ?? "");
}

/** Social links that are filled in, in display order. */
export const socialLinks = (
  [
    { key: "facebook", label: "Facebook", icon: "facebook" },
    { key: "x", label: "X (Twitter)", icon: "twitter" },
    { key: "instagram", label: "Instagram", icon: "instagram" },
    { key: "linkedin", label: "LinkedIn", icon: "linkedin" },
  ] as const
)
  .map((s) => ({ ...s, href: site.social[s.key] }))
  .filter((s) => isSet(s.href));
