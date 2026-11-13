/**
 * Brand & site configuration — edit this one file to change the business details
 * shown across the whole site (header, footer, contact blocks, SEO, structured data).
 *
 * Values in [SQUARE BRACKETS] are placeholders. Links whose value is still a
 * placeholder are hidden automatically (see `isSet`), so the site never shows a
 * broken link while you fill them in.
 */
import type { ImageMetadata } from "astro";
import logoMark from "../assets/brand/logo-mark.png";
import ogImage from "../assets/brand/og-image.jpg";

export interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

export const site = {
  name: "Jamal Cleaning Services",
  /** Registered name, as it appears on the Google Business listing; used in structured data. */
  legalName: "Jamal Cleaning Services Ltd.",
  shortName: "Jamal Cleaning",
  /** Canonical origin, no trailing slash. Keep in sync with `site` in astro.config.mjs. */
  url: "https://jmcleaningservice.ca",
  tagline: "Commercial janitorial done right",
  description:
    "Commercial janitorial services in Prince George, BC for retail stores, big-box stores, offices and commercial buildings: nightly cleaning, floor care and day porters. Free quotes.",
  /** Short "about" blurb used in the footer. */
  about:
    "Commercial janitorial and floor care for retail stores, offices and commercial buildings across Prince George, plus residential cleaning.",

  /**
   * The logo is a gold crest with no wordmark; the Logo component sets the business name beside it.
   * The crest, favicons, structured-data logo and share image are generated from
   * src/assets/brand/logo-source.svg by `npx tsx tools/assets/brand.ts`. To change the logo,
   * replace logo-source.svg and re-run that script.
   */
  logo: {
    /** Crest (transparent; works on light and dark backgrounds). */
    src: logoMark satisfies ImageMetadata,
    /** Wordmark set next to the crest: name on the first line, descriptor below. */
    wordmark: { name: "Jamal", descriptor: "Cleaning Services" },
  },

  contact: {
    phone: { display: "(236) 331-7323", href: "tel:+12363317323", e164: "+12363317323" },
    /**
     * WhatsApp is the main contact channel: it is offered first on every page (floating button,
     * header, menus, forms). Links are built with `whatsappLink()` below.
     */
    whatsapp: {
      /** Full international number, digits only (wa.me format: country code, no "+"). */
      number: "12363317323",
      display: "(236) 331-7323",
      /** First message typed for the visitor when the chat opens (they can edit it before sending). */
      message: "Hi Jamal Cleaning! I'd like a free quote for a cleaning.",
    },
    email: "info@jmcleaningservice.ca",
    address: {
      street: "[STREET ADDRESS]",
      locality: "Prince George",
      region: "BC",
      postalCode: "[POSTAL CODE]",
      country: "CA",
      /** One-line address for the top bar and footer. */
      short: "Prince George, BC, Canada",
      /** Centre of the Google Maps listing for the business (from its embed code), not a street-level pin. */
      geo: { latitude: 53.92689845, longitude: -122.7524185 },
      /** Link for "get directions" and the map embed on the contact page. */
      mapUrl: "https://maps.app.goo.gl/D7ibhfUKgzgssFM79",
      mapEmbedUrl:
        "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d178348.94930258516!2d-122.7524185!3d53.92689845!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4dcf780bb922733b%3A0xfdade72db216d3ee!2sJamal%20Cleaning%20Services%20Ltd.!5e1!3m2!1sen!2sca!4v1793506937301!5m2!1sen!2sca",
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
        { label: "Commercial Janitorial", href: "/services/janitorial-services/" },
        { label: "Retail & Big-Box Stores", href: "/services/retail-store-cleaning/" },
        { label: "Office & Building Cleaning", href: "/services/office-cleaning/" },
        { label: "Commercial Floor Care", href: "/services/commercial-floor-care/" },
        { label: "Post-Construction Cleaning", href: "/services/construction-cleaning/" },
        { label: "Residential & Move-Out", href: "/services/residential-services/" },
      ],
    },
    { label: "Projects", href: "/projects/" },
    { label: "Showcase", href: "/showcase/" },
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
    { label: "Showcase", href: "/showcase/" },
    { label: "FAQs", href: "/faqs/" },
    { label: "Contact Us", href: "/contact-us/" },
  ] satisfies NavItem[],

  /** Legal pages (footer bottom bar). Wording lives in src/pages/*.md. */
  legalNav: [
    { label: "Privacy Policy", href: "/privacy-policy/" },
    { label: "Terms of Use", href: "/terms-of-use/" },
    { label: "Service Terms", href: "/service-terms/" },
  ] satisfies NavItem[],

  seo: {
    titleTemplate: "%s | Jamal Cleaning Services",
    defaultTitle: "Jamal Cleaning Services | Commercial Janitorial in Prince George, BC",
    /** Default social share image (1200×630). */
    ogImage: ogImage satisfies ImageMetadata,
    ogImageAlt: "Jamal Cleaning Services — commercial janitorial in Prince George, BC",
    locale: "en_CA",
    twitterHandle: "[@TWITTER HANDLE]",
    keywords: [
      "janitorial services Prince George",
      "commercial cleaning Prince George",
      "retail store cleaning Prince George",
      "office cleaning Prince George BC",
      "commercial floor care strip and wax",
      "post-construction cleaning Prince George",
      "move out cleaning Prince George",
    ],
  },

  /** Footer credit. */
  developer: { name: "Aurora N&N Business Solution Inc.", url: "https://aurorabusiness.ca" },
} as const;

/** True when a config value has been filled in (not a [PLACEHOLDER] or empty). */
export function isSet(value: string | undefined | null): value is string {
  return Boolean(value) && !/^\[.*\]$/.test(value?.trim() ?? "");
}

/**
 * WhatsApp chat link (https://wa.me/…) with a pre-filled first message. Pass a page-specific
 * message (e.g. naming the service) or an empty string for no message.
 */
export function whatsappLink(message: string = site.contact.whatsapp.message): string {
  const base = `https://wa.me/${site.contact.whatsapp.number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
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
