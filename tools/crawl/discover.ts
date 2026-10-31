/**
 * Step 1a — discover in-scope pages.
 *
 * Starts at Home 4 (and Services Style 1), follows header, footer, off-canvas and
 * in-page links breadth-first, and applies the scope rules in lib/site.ts.
 * Images, media and fonts are not fetched here to keep the crawl light.
 *
 * Output: reference/discovery.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { connect, load, openPage } from "../lib/browser.ts";
import {
  HOME_URL,
  REFERENCE_DIR,
  SERVICES_URL,
  normalizeUrl,
  politeDelay,
  scopeOf,
  slugOf,
} from "../lib/site.ts";

type Region = "header" | "footer" | "offcanvas" | "content";

interface RawLink {
  href: string;
  text: string;
  region: Region;
}

interface PageRecord {
  url: string;
  finalUrl: string;
  slug: string;
  title: string;
  status: number;
  depth: number;
  foundOn: string[];
  regions: Region[];
  linkTexts: string[];
}

interface OtherRecord {
  url: string;
  reason: string;
  foundOn: string[];
  texts: string[];
}

const MAX_DEPTH = Number(process.env.MAX_DEPTH ?? 3);

function addUnique<T>(list: T[], value: T): void {
  if (value !== "" && !list.includes(value)) list.push(value);
}

async function main(): Promise<void> {
  const session = await connect();
  const page = await openPage(session, 1440);
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    return type === "image" || type === "media" || type === "font" ? route.abort() : route.continue();
  });

  const pages = new Map<string, PageRecord>();
  const others = new Map<string, OtherRecord>();
  const queue: { url: string; depth: number; from: string; region: Region; text: string }[] = [
    { url: HOME_URL, depth: 0, from: "(start)", region: "content", text: "Home 4" },
    { url: SERVICES_URL, depth: 1, from: "(start)", region: "content", text: "Services Style 1" },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const known = pages.get(item.url);
    if (known) {
      addUnique(known.foundOn, item.from);
      addUnique(known.regions, item.region);
      addUnique(known.linkTexts, item.text);
      continue;
    }
    if (visited.has(item.url)) continue;
    visited.add(item.url);

    if (visited.size > 1) await politeDelay();
    let status = 0;
    try {
      status = await load(page, item.url);
    } catch (error) {
      console.warn(`load failed ${item.url}: ${(error as Error).message}`);
    }
    const finalUrl = normalizeUrl(page.url()) ?? item.url;
    const title = await page.title().catch(() => "");
    const record: PageRecord = {
      url: item.url,
      finalUrl,
      slug: slugOf(item.url),
      title,
      status,
      depth: item.depth,
      foundOn: [item.from],
      regions: [item.region],
      linkTexts: item.text ? [item.text] : [],
    };
    pages.set(item.url, record);
    console.log(`[${pages.size}] d${item.depth} ${status} ${item.url} — ${title}`);

    const links: RawLink[] = await page.evaluate(() => {
      const regionOf = (a: Element): "header" | "footer" | "offcanvas" | "content" => {
        if (a.closest('[data-elementor-type="header"], header, .site-header')) return "header";
        if (a.closest('[data-elementor-type="footer"], footer, .site-footer')) return "footer";
        if (a.closest('[class*="canvas"], [class*="mobile-menu"], [class*="mobile-nav"], [class*="popup"]')) {
          return "offcanvas";
        }
        return "content";
      };
      return [...document.querySelectorAll("a[href]")].map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a.textContent ?? a.getAttribute("aria-label") ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
        region: regionOf(a),
      }));
    });

    for (const link of links) {
      const url = normalizeUrl(link.href);
      if (!url) continue;
      const scope = scopeOf(url);
      if (!scope.inScope) {
        const other = others.get(url) ?? { url, reason: scope.reason, foundOn: [], texts: [] };
        addUnique(other.foundOn, item.url);
        addUnique(other.texts, link.text);
        others.set(url, other);
        continue;
      }
      if (item.depth + 1 > MAX_DEPTH) continue;
      queue.push({ url, depth: item.depth + 1, from: item.url, region: link.region, text: link.text });
    }
  }

  await page.close();

  await fs.mkdir(REFERENCE_DIR, { recursive: true });
  const out = {
    crawledAt: new Date().toISOString(),
    start: [HOME_URL, SERVICES_URL],
    maxDepth: MAX_DEPTH,
    pages: [...pages.values()],
    skipped: [...others.values()].filter((o) => o.reason !== "external"),
    external: [...others.values()].filter((o) => o.reason === "external"),
  };
  const file = path.join(REFERENCE_DIR, "discovery.json");
  await fs.writeFile(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\n${out.pages.length} in-scope pages, ${out.skipped.length} skipped, ${out.external.length} external -> ${file}`);
}

// Exit explicitly: the CDP connection would otherwise keep the process alive,
// and closing the Browser object could take the shared Chrome down with it.
main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
