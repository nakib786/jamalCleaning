/**
 * Step 2 — download every asset the in-scope pages load.
 *
 * Crawls each page from reference/discovery.json at 1440 and 390 px, scrolls
 * slowly to trigger lazy loading, hovers the menus (mega menus / dropdowns),
 * clicks through slider arrows and bullets, tabs and accordions, opens the
 * mobile menu, and saves every network response to captured/<host>/<path>.
 *
 * Output: captured/** and captured/manifest.json (url, file, type, size, failures).
 *
 * Usage: tsx tools/crawl/capture.ts [--only=slug,slug] [--widths=1440,390]
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "playwright";
import { connect, load, openPage, slowScroll } from "../lib/browser.ts";
import { CaptureStore } from "../lib/capture-store.ts";
import { CAPTURED_DIR, REFERENCE_DIR, politeDelay, sleep } from "../lib/site.ts";

interface DiscoveredPage {
  url: string;
  slug: string;
  inBuild?: boolean;
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

/** Click without ever following a real link. */
async function safeClick(page: Page, target: Locator): Promise<void> {
  const href = await target.getAttribute("href").catch(() => null);
  if (href && !href.startsWith("#") && !href.startsWith("javascript")) return;
  const before = page.url();
  await target.click({ timeout: 2500, force: true }).catch(() => undefined);
  await sleep(450);
  if (page.url().split("#")[0] !== before.split("#")[0]) {
    await page.goBack({ waitUntil: "load" }).catch(() => undefined);
  }
}

async function eachVisible(
  page: Page,
  selector: string,
  max: number,
  fn: (el: Locator) => Promise<void>,
): Promise<void> {
  const all = page.locator(selector);
  const count = Math.min(await all.count(), max);
  for (let i = 0; i < count; i++) {
    const el = all.nth(i);
    if (await el.isVisible().catch(() => false)) await fn(el);
  }
}

async function interact(page: Page, width: number): Promise<void> {
  // Menus: hover every top-level item so dropdowns and mega menus render their content.
  await eachVisible(page, "header li.menu-item-has-children > a, header .menu-item > a", 30, async (el) => {
    await el.hover({ timeout: 2000 }).catch(() => undefined);
    await sleep(350);
  });

  // Sliders: arrows and bullets (Swiper / Elementor / theme carousels).
  const arrows =
    ".swiper-button-next, .elementor-swiper-button-next, .swiper-button-prev, .elementor-swiper-button-prev, .slick-next, .owl-next";
  await eachVisible(page, arrows, 12, async (el) => {
    await el.scrollIntoViewIfNeeded().catch(() => undefined);
    for (let i = 0; i < 4; i++) await safeClick(page, el);
  });
  await eachVisible(page, ".swiper-pagination-bullet, .slick-dots button, .owl-dot", 40, (el) =>
    safeClick(page, el),
  );

  // Tabs and accordions.
  const toggles =
    '[role="tab"], .elementor-tab-title, .e-n-tab-title, .elementor-accordion-title, .elementor-tab-title a, .e-n-accordion-item-title, .elementor-toggle-title, details > summary';
  await eachVisible(page, toggles, 40, async (el) => {
    await el.scrollIntoViewIfNeeded().catch(() => undefined);
    await safeClick(page, el);
  });

  // Mobile / off-canvas menu.
  if (width < 1025) {
    const burger = page
      .locator(
        '.elementor-menu-toggle, [class*="menu-mobile"] button, [class*="mobile-nav-button"], [class*="canvas"] button, .menu-toggle, [aria-label*="menu" i]',
      )
      .first();
    if (await burger.isVisible().catch(() => false)) {
      await safeClick(page, burger);
      await sleep(800);
      await eachVisible(
        page,
        '[class*="canvas"] .menu-item-has-children > a, [class*="mobile"] .sub-menu-toggle',
        20,
        (el) => safeClick(page, el),
      );
      await page.keyboard.press("Escape").catch(() => undefined);
    }
  }
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
}

async function main(): Promise<void> {
  const discovery = JSON.parse(await fs.readFile(path.join(REFERENCE_DIR, "discovery.json"), "utf8")) as {
    pages: DiscoveredPage[];
  };
  const only = arg("only")?.split(",");
  const widths = (arg("widths") ?? "1440,390").split(",").map(Number);
  const pages = discovery.pages.filter((p) => p.inBuild !== false && (!only || only.includes(p.slug)));

  const store = new CaptureStore();
  const manifestFile = path.join(CAPTURED_DIR, "manifest.json");
  await store.load(manifestFile);
  const session = await connect();

  let first = true;
  for (const ref of pages) {
    for (const width of widths) {
      if (!first) await politeDelay();
      first = false;
      const page = await openPage(session, width, width < 768 ? 844 : 900);
      const stop = store.attach(page, { slug: ref.slug, width });
      try {
        await load(page, ref.url);
        await slowScroll(page, 280, 220);
        await interact(page, width);
        await slowScroll(page, 500, 150);
      } catch (error) {
        console.warn(`${ref.slug} @${width} failed: ${(error as Error).message}`);
      } finally {
        await stop();
        await page.close();
      }
      await store.write(manifestFile);
      console.log(
        `${ref.slug} @${width}: manifest ${store.entries.size} files, ${store.failures.size} failures`,
      );
    }
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
