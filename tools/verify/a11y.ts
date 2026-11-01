/**
 * Step 8 — accessibility sweep of the rebuilt site with axe-core.
 *
 * Opens every built page (found by scanning `dist/` for index.html, plus a 404) at
 * desktop and mobile width in a headless Chromium that Playwright launches itself,
 * forces the scroll-reveal elements visible (axe skips elements that are still at
 * opacity 0, which would hide real contrast problems), and runs axe with the WCAG
 * 2.0/2.1/2.2 A + AA rule sets. Exits with 1 if any violation is found.
 *
 * Serve the production build first, e.g. `npm run preview` (wrangler dev on :8787).
 * Set CHROME_PATH to use an existing Chrome/Chromium instead of Playwright's download.
 *
 * Usage: tsx tools/verify/a11y.ts [--base=http://127.0.0.1:8787] [--widths=1440,390] [--only=/about-us/,/faqs/]
 */
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, type Page } from "playwright";
import { builtRoutes, NOT_FOUND_ROUTE } from "../lib/built-routes.ts";

const require = createRequire(import.meta.url);

interface AxeNode {
  target: unknown[];
  html: string;
  failureSummary?: string;
}
interface AxeResult {
  id: string;
  impact?: string | null;
  help: string;
  nodes: AxeNode[];
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/**
 * Show scroll-driven elements in their final state, without waiting for animations:
 * entrance reveals ([data-reveal]) and the scroll-lit testimonials, which are dimmed
 * only until the reader has scrolled past them.
 */
async function settle(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "[data-reveal]{opacity:1!important;animation:none!important;transform:none!important}" +
      "[data-testimonial]{opacity:1!important}",
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function main(): Promise<void> {
  const base = (arg("base") ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const widths = (arg("widths") ?? "1440,390").split(",").map(Number);
  const only = arg("only")?.split(",");
  const routes = [...(await builtRoutes()), NOT_FOUND_ROUTE].filter((r) => !only || only.includes(r));
  const axeSource = await fs.readFile(require.resolve("axe-core/axe.min.js"), "utf8");

  // CHROME_PATH points at a Chrome/Chromium binary when Playwright's own download is not installed.
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  let violationCount = 0;
  let pageCount = 0;

  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(`${base}${route}`, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      await settle(page);
      await page.evaluate(axeSource);
      const { violations } = (await page.evaluate(() =>
        // @ts-expect-error axe is injected into the page by the line above
        // aria-hidden subtrees are decorative (e.g. the faint marquee words), which WCAG exempts
        // from contrast requirements; axe cannot tell, so leave them out.
        axe.run(
          { include: [["html"]], exclude: [['[aria-hidden="true"]']] },
          {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
            resultTypes: ["violations"],
          },
        ),
      )) as { violations: AxeResult[] };
      pageCount++;
      if (violations.length === 0) {
        console.log(`ok    ${String(width).padStart(4)}  ${route}`);
        continue;
      }
      for (const v of violations) {
        violationCount += v.nodes.length;
        console.log(`FAIL  ${String(width).padStart(4)}  ${route}  ${v.id} (${v.impact}) — ${v.help}`);
        for (const node of v.nodes.slice(0, 5)) {
          const summary = (node.failureSummary ?? "").split("\n").slice(1, 3).join(" ").trim();
          console.log(`        ${node.target.join(" ")}\n        ${summary}`);
        }
      }
    }
    await context.close();
  }

  await browser.close();
  console.log(`\n${pageCount} page loads checked, ${violationCount} violating element(s).`);
  process.exitCode = violationCount > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1); // also closes a still-open browser
});
