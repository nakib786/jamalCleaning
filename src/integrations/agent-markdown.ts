/**
 * Astro integration: after the build, writes a Markdown copy of every page next to its HTML
 * (dist/<page>/index.md) for AI agents. The Worker (worker/index.ts) serves it when a request
 * prefers `Accept: text/markdown`, and directly at <page>/index.md. Cloudflare's own "Markdown for
 * Agents" does the same on paid plans; this gives the same result on the free plan.
 *
 * The copy holds the page's main content only (no header, footer, forms, scripts or decoration),
 * with absolute links, plus a short contact block taken from the page's LocalBusiness JSON-LD.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { HTMLElement, parse } from "node-html-parser";

interface Options {
  /** Page where visitors request a quote (keep in sync with `site.quote.href` in src/config/site.ts). */
  quotePath: string;
}

/** Elements with nothing for an agent to read: scripts, controls, embeds and decoration. */
const REMOVE = [
  "script",
  "style",
  "svg",
  "noscript",
  "template",
  "iframe",
  "video",
  "dialog",
  "form",
  "input",
  "select",
  "textarea",
  "[aria-hidden='true']",
  "[hidden]",
  "[data-empty]",
  "nav[aria-label='Breadcrumb']",
  // Service-page sidebar (other services, contact card): the contact block at the end covers it.
  "aside",
].join(",");

/** Tailwind display classes that make an inline element (a <span>) render as a block. */
const BLOCK_CLASS = /(?:^|\s)(?:block|flex|grid)(?:\s|$)/;

/** The parts of the business JSON-LD (src/components/seo/Seo.astro) used for the contact block. */
interface BusinessLd {
  "@type"?: string;
  name?: string;
  telephone?: string;
  email?: string;
  hasMap?: string;
  contactPoint?: { url?: string };
  areaServed?: { name?: string; containedInPlace?: { name?: string } };
}

export default function agentMarkdown(options: Options): AstroIntegration {
  let site = "";
  return {
    name: "agent-markdown",
    hooks: {
      "astro:config:done": ({ config }) => {
        site = config.site ?? "";
      },
      "astro:build:done": async ({ dir, pages, logger }) => {
        const root = fileURLToPath(dir);
        let written = 0;
        for (const { pathname } of pages) {
          const folder = join(root, pathname);
          let html: string;
          try {
            html = await readFile(join(folder, "index.html"), "utf8");
          } catch {
            continue; // Endpoints (llms.txt, JSON) and the 404 page have no <page>/index.html.
          }
          await writeFile(join(folder, "index.md"), toMarkdown(html, site, options));
          written++;
        }
        logger.info(`Wrote ${written} Markdown pages for AI agents`);
      },
    },
  };
}

/** Converts one built HTML page to Markdown with YAML frontmatter (title, description, url). */
export function toMarkdown(html: string, site: string, { quotePath }: Options): string {
  const doc = parse(html);
  const title = doc.querySelector("title")?.text.trim() ?? "";
  const description = doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
  const url = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? site;
  const business = doc
    .querySelectorAll('script[type="application/ld+json"]')
    .map((script) => {
      try {
        return JSON.parse(script.text) as BusinessLd;
      } catch {
        return undefined;
      }
    })
    .find((data) => data?.["@type"] === "LocalBusiness");

  const main = doc.querySelector("main");
  if (!main) throw new Error(`agent-markdown: no <main> in ${url}`);
  // Photo buttons (Showcase) keep their photo; every other button is a control and goes.
  for (const button of main.querySelectorAll("button")) {
    const photo = button.querySelector("img[alt]");
    if (photo?.getAttribute("alt")?.trim()) button.replaceWith(photo);
    else button.remove();
  }
  for (const element of main.querySelectorAll(REMOVE)) element.remove();
  for (const image of main.querySelectorAll("img")) {
    const src = image.getAttribute("src");
    if (!image.getAttribute("alt")?.trim() || !src) {
      image.remove();
      continue;
    }
    image.setAttribute("src", new URL(src, url).href);
    image.removeAttribute("srcset");
  }
  for (const link of main.querySelectorAll("a[href]")) {
    // Icon-only links (an arrow whose SVG was removed) would become empty "[](url)".
    if (!link.text.trim() && !link.querySelector("img")) {
      link.remove();
      continue;
    }
    link.setAttribute("href", new URL(link.getAttribute("href") ?? "", url).href);
  }
  // Spans styled as blocks (feature titles, names above roles) read as separate lines, not one run.
  for (const span of main.querySelectorAll("span")) {
    const classes = span.getAttribute("class") ?? "";
    if (!BLOCK_CLASS.test(classes)) continue;
    span.rawTagName = "div";
    // In a column (flex-col) or grid, each child span sits on its own line as well.
    if (/(?:^|\s)(?:flex-col|grid)(?:\s|$)/.test(classes)) {
      for (const child of span.childNodes) {
        if (child instanceof HTMLElement && child.rawTagName === "span") child.rawTagName = "div";
      }
    }
  }

  const body = NodeHtmlMarkdown.translate(main.innerHTML, { maxConsecutiveNewlines: 2 }).trim();
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `url: ${JSON.stringify(url)}`,
    "---",
  ];
  return [...frontmatter, "", body, "", ...contactBlock(business, new URL(quotePath, site).href)].join("\n");
}

function contactBlock(business: BusinessLd | undefined, quoteUrl: string): string[] {
  if (!business?.name) return [];
  const area = business.areaServed;
  return [
    "---",
    "",
    `## Contact ${business.name}`,
    "",
    ...(business.contactPoint?.url ? [`- WhatsApp (preferred): ${business.contactPoint.url}`] : []),
    ...(business.telephone ? [`- Phone: ${business.telephone}`] : []),
    ...(business.email ? [`- Email: ${business.email}`] : []),
    `- Free quote request: ${quoteUrl}`,
    ...(area?.name
      ? [`- Service area: ${[area.name, area.containedInPlace?.name].filter(Boolean).join(", ")}`]
      : []),
    ...(business.hasMap ? [`- Google Maps: ${business.hasMap}`] : []),
    "",
  ];
}
