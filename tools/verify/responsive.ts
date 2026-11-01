/**
 * Step 8 — mobile and tablet layout check of the rebuilt site.
 *
 * Opens every built page at 390 and 768 px (override with --widths), forces the scroll-reveal
 * elements into their final state, and reports:
 *  - horizontal overflow: the page is wider than the viewport (a sideways scrollbar on phones)
 *  - elements whose box sticks out of the viewport, unless they sit inside a clipping ancestor
 *    (overflow hidden/clip/auto/scroll, e.g. carousels and the marquee) or are fixed/off-screen on purpose
 * and saves a full-page screenshot per page and width to verify-output/screens/ for visual review.
 * Exits with 1 if overflow is found.
 *
 * Serve the production build first, e.g. `npm run preview` (wrangler dev on :8787).
 * Set CHROME_PATH to use an existing Chrome/Chromium instead of Playwright's download.
 *
 * Usage: tsx tools/verify/responsive.ts [--base=http://127.0.0.1:8787] [--widths=390,768] [--only=/about-us/]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { builtRoutes, NOT_FOUND_ROUTE } from "../lib/built-routes.ts";
import { ROOT } from "../lib/site.ts";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

interface Finding {
  kind: "page-overflow" | "element-overflow";
  detail: string;
}

async function main(): Promise<void> {
  const base = (arg("base") ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const widths = (arg("widths") ?? "390,768").split(",").map(Number);
  const only = arg("only")?.split(",");
  const routes = [...(await builtRoutes()), NOT_FOUND_ROUTE].filter((r) => !only || only.includes(r));
  const outDir = path.join(ROOT, "verify-output", "screens");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  let problems = 0;

  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    // tsx (esbuild keepNames) wraps named functions in __name(); give page.evaluate a no-op shim.
    await page.addInitScript({ content: "globalThis.__name = (fn) => fn;" });
    for (const route of routes) {
      await page.goto(`${base}${route}`, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      await page.addStyleTag({
        content:
          "[data-reveal]{opacity:1!important;animation:none!important;transform:none!important}" +
          "[data-testimonial]{opacity:1!important}",
      });
      await page.evaluate(() => document.fonts.ready);
      // Full-page screenshots do not scroll, so load lazy images up front.
      await page.evaluate(async () => {
        const images = [...document.querySelectorAll<HTMLImageElement>("img")];
        images.forEach((img) => (img.loading = "eager"));
        await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
      });
      await page.waitForTimeout(300);

      const findings = (await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const out: { kind: string; detail: string }[] = [];
        const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        if (scrollWidth > vw + 1)
          out.push({ kind: "page-overflow", detail: `page is ${scrollWidth}px wide in a ${vw}px viewport` });

        const clipped = (el: Element): boolean => {
          // <body> and <html> clip sideways overflow themselves, so only look at ancestors below them.
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) return true;
            if (s.position === "fixed") return true;
          }
          return false;
        };
        const label = (el: Element): string => {
          const cls =
            typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
          return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
        };
        const seen = new Set<string>();
        for (const el of document.querySelectorAll("body *")) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.position === "fixed")
            continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 1 || r.left < -1) {
            if (clipped(el)) continue;
            const key = label(el);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
              kind: "element-overflow",
              detail: `${key} spans ${Math.round(r.left)}–${Math.round(r.right)}px`,
            });
          }
        }
        return out.slice(0, 12);
      })) as Finding[];

      const slug = route === "/" ? "home" : route.replaceAll("/", "_").replace(/^_|_$/g, "");
      await page.screenshot({ path: path.join(outDir, `${slug}-${width}.png`), fullPage: true });

      if (findings.length === 0) console.log(`ok    ${String(width).padStart(4)}  ${route}`);
      for (const f of findings) {
        problems++;
        console.log(`FAIL  ${String(width).padStart(4)}  ${route}  ${f.kind}  ${f.detail}`);
      }
    }
    await context.close();
  }

  await browser.close();
  console.log(`\nScreenshots: ${path.relative(ROOT, outDir)}/`);
  console.log(`${routes.length * widths.length} page loads checked, ${problems} problem(s).`);
  process.exitCode = problems > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1); // also closes a still-open browser
});
