/** Playwright helpers that drive the loopback Chrome REA also attaches to. */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { CDP_ENDPOINT, sleep } from "./site.ts";

export interface Session {
  browser: Browser;
  context: BrowserContext;
}

/** Attach to the already-running Chrome so REA and Playwright see the same tabs and cache. */
export async function connect(): Promise<Session> {
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  return { browser, context };
}

export async function openPage(session: Session, width: number, height = 900): Promise<Page> {
  const page = await session.context.newPage();
  // tsx (esbuild keepNames) wraps named functions in __name(); functions passed to
  // page.evaluate are serialized with that call, so give the page a no-op shim.
  await page.addInitScript({ content: "globalThis.__name = (fn) => fn;" });
  await page.setViewportSize({ width, height });
  return page;
}

/** Load a URL and wait until the network is quiet (bounded so long-polling never hangs us). */
export async function load(page: Page, url: string): Promise<number> {
  const response = await page.goto(url, { waitUntil: "load", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  return response?.status() ?? 0;
}

/**
 * Scroll to the bottom in small steps so lazy images, counters and entrance
 * animations fire, keep going while the page grows, then return to the top.
 */
export async function slowScroll(page: Page, step = 350, pauseMs = 180): Promise<void> {
  let lastHeight = 0;
  for (let guard = 0; guard < 400; guard++) {
    const { y, height, viewport } = await page.evaluate((dy) => {
      window.scrollBy(0, dy);
      const el = document.scrollingElement ?? document.documentElement;
      return { y: window.scrollY, height: el.scrollHeight, viewport: window.innerHeight };
    }, step);
    await sleep(pauseMs);
    if (y + viewport >= height - 2) {
      if (height === lastHeight) break;
      lastHeight = height;
      await sleep(800);
    }
  }
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(600);
}

/** CDP target id of a Playwright page, as REA's list_browser_targets reports it. */
export async function targetIdOf(page: Page): Promise<string> {
  const cdp = await page.context().newCDPSession(page);
  const info = (await cdp.send("Target.getTargetInfo")) as { targetInfo: { targetId: string } };
  await cdp.detach();
  return info.targetInfo.targetId;
}
