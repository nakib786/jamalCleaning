/** Reference-site constants and URL scoping rules shared by the crawl tools. */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEMO_ORIGIN = "https://demo2.pavothemes.com";
export const DEMO_BASE = `${DEMO_ORIGIN}/cetro/`;
export const HOME_URL = `${DEMO_BASE}home-4/`;
export const SERVICES_URL = `${DEMO_BASE}services-style-01/`;

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REFERENCE_DIR = path.join(ROOT, "reference");
export const CAPTURED_DIR = path.join(ROOT, "captured");

/** Loopback Chrome started with --remote-debugging-port=9222 (see tools/README.md). */
export const CDP_ENDPOINT = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222";

/** Polite pause between page loads on the demo server. */
export const PAGE_DELAY_MS = Number(process.env.PAGE_DELAY_MS ?? 4000);

export type Scope = { inScope: true } | { inScope: false; reason: string };

/** Drop hash and query, force a trailing slash on directory-like paths. */
export function normalizeUrl(href: string, base = DEMO_BASE): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.hash = "";
  url.search = "";
  if (!/\.[a-z0-9]{2,5}$/i.test(url.pathname) && !url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

const SKIP_RULES: [RegExp, string][] = [
  [/\/wp-(admin|json|login\.php|includes|content|cron\.php)/, "WordPress internals"],
  [/\/xmlrpc\.php|\/feed\/|\/comments\/feed\/|\/embed\/$/, "WordPress feeds/endpoints"],
  [/\/(cart|checkout|my-account|wishlist|compare|lost-password)\//, "cart/checkout/account (out of scope)"],
  [/\/(shop|product|product-category|product-tag|brand)\//, "WooCommerce shop (not part of a service site)"],
  [/\/(author|tag|category)\/|\/\d{4}\/\d{2}\//, "WordPress archive"],
  [/\/home-(?!4\/)[\w-]+\/$/, "other home-page variant"],
  [/\/services-style-(?!01\/)[\w-]+\/$/, "other service-page style"],
];

export function scopeOf(normalized: string): Scope {
  const url = new URL(normalized);
  if (url.origin !== DEMO_ORIGIN || !url.pathname.startsWith("/cetro/")) {
    return { inScope: false, reason: "external" };
  }
  if (url.pathname === "/cetro/") return { inScope: false, reason: "other home-page variant (demo root)" };
  if (/\.(jpe?g|png|webp|gif|svg|pdf|zip|mp4|webm|css|js)$/i.test(url.pathname)) {
    return { inScope: false, reason: "file, not a page" };
  }
  for (const [pattern, reason] of SKIP_RULES) {
    if (pattern.test(url.pathname)) return { inScope: false, reason };
  }
  return { inScope: true };
}

/** File-system friendly slug for a demo URL, e.g. `.../cetro/about-us/` -> `about-us`. */
export function slugOf(normalized: string): string {
  const rel = new URL(normalized).pathname.replace(/^\/cetro\//, "").replace(/\/$/, "");
  return rel === "" ? "root" : rel.replace(/\//g, "__");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Delay with +/-25% jitter so requests never line up in bursts. */
export function politeDelay(ms = PAGE_DELAY_MS): Promise<void> {
  return sleep(Math.round(ms * (0.75 + Math.random() * 0.5)));
}
