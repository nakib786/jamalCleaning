/**
 * Step 8 — link, asset and demo-leftover check of the rebuilt site.
 *
 * Opens every built page in headless Chromium and reports:
 *  - internal links, images, scripts, stylesheets and srcset candidates that do not answer 200
 *    (redirects count as OK when they end on a 200), and #anchors without a matching id
 *  - references to the demo/theme hosts (pavothemes, themeforest, example.com, localhost)
 *  - visible demo text ("Cetro", "Pavothemes", "Themeforest", "lorem ipsum", unfilled [PLACEHOLDERS])
 *  - images without an alt attribute, empty `href="#"` links
 *  - console errors, uncaught page errors and failed same-origin requests
 * External links are listed (not fetched) so they can be checked by hand.
 * Exits with 1 if anything is reported.
 *
 * Serve the production build first, e.g. `npm run preview` (wrangler dev on :8787).
 * Set CHROME_PATH to use an existing Chrome/Chromium instead of Playwright's download.
 *
 * Usage: tsx tools/verify/links.ts [--base=http://127.0.0.1:8787] [--only=/about-us/,/faqs/]
 */
import { chromium, type APIRequestContext } from "playwright";
import { builtRoutes, NOT_FOUND_ROUTE } from "../lib/built-routes.ts";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const DEMO_HOSTS = /pavothemes|themeforest|envato|evanto|example\.(com|org)|localhost|127\.0\.0\.1/i;
const DEMO_TEXT =
  /\b(cetro|pavothemes|themeforest|evanto|envato|lorem ipsum|dolor sit amet)\b|\[[A-Z][A-Z ]{2,}\]/i;
/**
 * Facts copied from the demo that only the owner can replace (reviewer names, ratings, client and
 * team counts). Reported as warnings: they do not fail the check but must be gone before launch.
 */
const PLACEHOLDER_TEXT =
  /dishes cleaning|Ariana Green|Fresh Design|586k Clients|Ratings 4\.5|team of 30 experts|Over 250 successful projects|All of our clients are satisfied|Skilled Tradespeople|Cleaning Experts|Satisfaction Rate|Successful Projects|Happy Clients/i;
/** Third-party hosts the page legitimately loads; they are not reachable from every network. */
const IGNORED_REQUEST_HOSTS = /challenges\.cloudflare\.com/;

interface PageScan {
  links: string[];
  assets: string[];
  anchors: string[];
  ids: string[];
  missingAlt: string[];
  emptyLinks: number;
  visibleDemoText: string[];
  visiblePlaceholders: string[];
  hrefs: string[];
}

async function scanPage(page: import("playwright").Page): Promise<PageScan> {
  return page.evaluate(
    ({ demo, placeholder }) => {
      const abs = (v: string) => new URL(v, document.baseURI).href;
      const demoText = new RegExp(demo, "i");
      const placeholderText = new RegExp(placeholder, "i");
      const assets = new Set<string>();
      document
        .querySelectorAll(
          "img[src], script[src], link[href][rel~='stylesheet'], link[href][rel~='icon'], link[href][rel~='preload'], link[rel='manifest'], source[src], video[src]",
        )
        .forEach((el) => {
          const v = el.getAttribute("src") ?? el.getAttribute("href");
          if (v && !v.startsWith("data:")) assets.add(abs(v));
        });
      document.querySelectorAll("img[srcset], source[srcset], link[imagesrcset]").forEach((el) => {
        const set = el.getAttribute("srcset") ?? el.getAttribute("imagesrcset") ?? "";
        set
          .split(",")
          .map((c) => c.trim().split(/\s+/)[0] ?? "")
          .filter((u) => u !== "" && !u.startsWith("data:"))
          .forEach((u) => assets.add(abs(u)));
      });
      const hrefs = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "");
      const text = document.body.innerText;
      const visibleDemoText = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && demoText.test(l))
        .slice(0, 10);
      const visiblePlaceholders = [
        ...new Set(
          text
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && placeholderText.test(l)),
        ),
      ].slice(0, 10);
      return {
        links: hrefs.filter((h) => !h.startsWith("#") && !/^(mailto|tel|sms|javascript):/i.test(h)).map(abs),
        assets: [...assets],
        anchors: hrefs.filter((h) => h.startsWith("#") && h.length > 1),
        ids: [...document.querySelectorAll("[id]")].map((e) => e.id),
        missingAlt: [...document.querySelectorAll("img:not([alt])")].map((i) => i.getAttribute("src") ?? ""),
        emptyLinks: hrefs.filter((h) => h === "#" || h === "").length,
        visibleDemoText,
        visiblePlaceholders,
        hrefs,
      };
    },
    { demo: DEMO_TEXT.source, placeholder: PLACEHOLDER_TEXT.source },
  );
}

async function status(request: APIRequestContext, url: string, cache: Map<string, number>): Promise<number> {
  const hit = cache.get(url);
  if (hit !== undefined) return hit;
  let code: number;
  try {
    code = (await request.get(url, { maxRedirects: 5, timeout: 30_000 })).status();
  } catch {
    code = 0;
  }
  cache.set(url, code);
  return code;
}

async function main(): Promise<void> {
  const base = (arg("base") ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const origin = new URL(base).origin;
  const only = arg("only")?.split(",");
  const routes = (await builtRoutes()).filter((r) => !only || only.includes(r));

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  // tsx (esbuild keepNames) wraps named functions in __name(); give page.evaluate a no-op shim.
  await page.addInitScript({ content: "globalThis.__name = (fn) => fn;" });
  const cache = new Map<string, number>();
  const external = new Map<string, Set<string>>();
  let problems = 0;
  const placeholders = new Map<string, Set<string>>();
  const report = (route: string, kind: string, detail: string) => {
    problems++;
    console.log(`FAIL  ${route}  ${kind}  ${detail}`);
  };

  let current = "";
  page.on("console", (msg) => {
    if (msg.type() === "error" && !IGNORED_REQUEST_HOSTS.test(msg.location().url)) {
      // Resource-load failures are reported through requestfailed/response checks below.
      if (!/Failed to load resource/.test(msg.text()))
        report(current, "console-error", msg.text().slice(0, 200));
    }
  });
  page.on("pageerror", (error) => report(current, "page-error", error.message.slice(0, 200)));
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (url.startsWith(origin) && !IGNORED_REQUEST_HOSTS.test(url)) {
      report(current, "request-failed", `${url} (${request.failure()?.errorText})`);
    }
  });

  for (const route of routes) {
    current = route;
    const response = await page.goto(`${base}${route}`, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    if (response?.status() !== 200) report(route, "page-status", String(response?.status()));
    const scan = await scanPage(page);

    for (const href of scan.hrefs) {
      if (DEMO_HOSTS.test(href) && !href.startsWith("/")) report(route, "demo-host", href);
    }
    for (const line of scan.visibleDemoText) report(route, "demo-text", line.slice(0, 140));
    for (const line of scan.visiblePlaceholders) {
      const where = placeholders.get(line.slice(0, 100)) ?? new Set<string>();
      where.add(route);
      placeholders.set(line.slice(0, 100), where);
    }
    for (const src of scan.missingAlt) report(route, "img-without-alt", src);
    if (scan.emptyLinks > 0) report(route, "empty-href", `${scan.emptyLinks} link(s) with href="#" or ""`);
    const ids = new Set(scan.ids);
    for (const a of scan.anchors) {
      if (!ids.has(decodeURIComponent(a.slice(1)))) report(route, "missing-anchor", a);
    }

    for (const url of new Set([...scan.links, ...scan.assets])) {
      if (!url.startsWith(origin)) {
        const pages = external.get(url) ?? new Set<string>();
        pages.add(route);
        external.set(url, pages);
        if (DEMO_HOSTS.test(url)) report(route, "demo-host", url);
        continue;
      }
      const target = new URL(url);
      target.hash = "";
      const code = await status(context.request, target.href, cache);
      if (code !== 200) report(route, "broken", `${url} → ${code}`);
    }
  }

  // The 404 page itself must be served with a 404 status.
  const notFound = await context.request.get(`${base}${NOT_FOUND_ROUTE}`);
  if (notFound.status() !== 404)
    report(NOT_FOUND_ROUTE, "page-status", `expected 404, got ${notFound.status()}`);

  await browser.close();

  console.log(`\nExternal links (not fetched, check by hand): ${external.size}`);
  for (const [url, pages] of [...external].sort())
    console.log(`  ${url}  (${[...pages].slice(0, 3).join(", ")}${pages.size > 3 ? ", …" : ""})`);
  console.log(`\nDemo facts that need real owner data before launch (warnings): ${placeholders.size}`);
  for (const [line, pages] of placeholders)
    console.log(`  "${line}"  (${[...pages].slice(0, 3).join(", ")}${pages.size > 3 ? ", …" : ""})`);
  console.log(`\n${routes.length} pages, ${cache.size} internal URLs checked, ${problems} problem(s).`);
  process.exitCode = problems > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1); // also closes a still-open browser
});
