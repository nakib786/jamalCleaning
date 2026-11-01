/**
 * Step 8 — visual comparison of the rebuild against the reference demo.
 *
 * For every in-build page in reference/discovery.json (or --pair=REF_URL,BUILD_URL) this opens the
 * reference page and the rebuilt page at each width in two headless Chromium pages, scrolls both
 * with wheel events (so lazy images, counters and entrance animations fire, and Lenis does not fight
 * the scroll), takes full-page screenshots, cuts them into viewport-high bands and diffs each band.
 *
 * A band is flagged when more than --band-threshold (default 8%) of its pixels differ noticeably.
 * Differing bands are written as reference | rebuild | diff strips to verify-output/compare/, plus a
 * summary.json. Page height differences are reported too, since they shift every band below them.
 * Exits with 1 if any band is flagged.
 *
 * Needs network access to the reference site (https://demo2.pavothemes.com/cetro/) and a served
 * production build (`npm run preview`). Set CHROME_PATH to use an existing Chrome/Chromium.
 *
 * Usage:
 *   tsx tools/verify/compare.ts [--rebuild=http://127.0.0.1:8787] [--widths=1440,768,390]
 *                               [--only=/about-us/,/faqs/] [--band-threshold=0.08]
 *   tsx tools/verify/compare.ts --pair=https://example.test/a/,http://127.0.0.1:8787/b/   (ad hoc pair)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { NOT_FOUND_ROUTE } from "../lib/built-routes.ts";
import { REFERENCE_DIR, ROOT, sleep } from "../lib/site.ts";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

interface Pair {
  label: string;
  referenceUrl: string;
  rebuildUrl: string;
}

interface Shot {
  data: Buffer;
  width: number;
  height: number;
}

/** A pixel counts as different when any colour channel is off by more than this. */
const CHANNEL_TOLERANCE = 32;
const CHANNELS = 4;

async function loadPairs(rebuild: string, only: string[] | undefined): Promise<Pair[]> {
  const adHoc = process.argv.filter((a) => a.startsWith("--pair=")).map((a) => a.slice("--pair=".length));
  if (adHoc.length > 0) {
    return adHoc.map((value, i) => {
      const [referenceUrl = "", rebuildUrl = ""] = value.split(",");
      return { label: `pair-${i + 1}`, referenceUrl, rebuildUrl };
    });
  }
  const discovery = JSON.parse(await fs.readFile(path.join(REFERENCE_DIR, "discovery.json"), "utf8")) as {
    pages: { url: string; route?: string; inBuild?: boolean }[];
  };
  return discovery.pages
    .filter((p) => p.inBuild && p.route)
    .map((p) => {
      const route = p.route === "/404.html" ? NOT_FOUND_ROUTE : (p.route as string);
      return { label: route, referenceUrl: p.url, rebuildUrl: `${rebuild}${route}` };
    })
    .filter((p) => !only || only.includes(p.label));
}

/** Scroll to the bottom with wheel events, then back to the top, so scroll-driven content settles. */
async function warmUp(page: Page): Promise<void> {
  await page.mouse.move(10, 10);
  for (let guard = 0; guard < 300; guard++) {
    const done = await page.evaluate(
      () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
    );
    if (done) break;
    await page.mouse.wheel(0, 400);
    await sleep(120);
  }
  await sleep(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.wheel(0, -100_000);
  await sleep(800);
}

async function capture(page: Page, url: string): Promise<Shot> {
  await page.goto(url, { waitUntil: "load", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await warmUp(page);
  const png = await page.screenshot({ fullPage: true });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Fraction of pixels that differ in rows [top, top+rows) of two equally wide images. */
function bandDifference(a: Shot, b: Shot, top: number, rows: number): { ratio: number; diff: Buffer } {
  const width = Math.min(a.width, b.width);
  const diff = Buffer.alloc(width * rows * CHANNELS);
  let different = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const ia = ((top + y) * a.width + x) * CHANNELS;
      const ib = ((top + y) * b.width + x) * CHANNELS;
      const out = (y * width + x) * CHANNELS;
      const bad =
        Math.abs((a.data[ia] ?? 0) - (b.data[ib] ?? 0)) > CHANNEL_TOLERANCE ||
        Math.abs((a.data[ia + 1] ?? 0) - (b.data[ib + 1] ?? 0)) > CHANNEL_TOLERANCE ||
        Math.abs((a.data[ia + 2] ?? 0) - (b.data[ib + 2] ?? 0)) > CHANNEL_TOLERANCE;
      if (bad) different++;
      diff[out] = bad ? 255 : 235;
      diff[out + 1] = bad ? 0 : 235;
      diff[out + 2] = bad ? 0 : 235;
      diff[out + 3] = 255;
    }
  }
  return { ratio: different / (width * rows), diff };
}

async function writeStrip(
  file: string,
  a: Shot,
  b: Shot,
  diff: Buffer,
  top: number,
  rows: number,
): Promise<void> {
  const width = Math.min(a.width, b.width);
  const crop = (shot: Shot) =>
    sharp(shot.data, { raw: { width: shot.width, height: shot.height, channels: CHANNELS } })
      .extract({ left: 0, top, width, height: rows })
      .png()
      .toBuffer();
  const gap = 12;
  const panels = [
    await crop(a),
    await crop(b),
    await sharp(diff, { raw: { width, height: rows, channels: CHANNELS } })
      .png()
      .toBuffer(),
  ];
  await sharp({ create: { width: width * 3 + gap * 2, height: rows, channels: 3, background: "#777" } })
    .composite(panels.map((input, i) => ({ input, left: i * (width + gap), top: 0 })))
    .png()
    .toFile(file);
}

async function main(): Promise<void> {
  const rebuild = (arg("rebuild") ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const widths = (arg("widths") ?? "1440,768,390").split(",").map(Number);
  const only = arg("only")?.split(",");
  const threshold = Number(arg("band-threshold") ?? "0.08");
  const pairs = await loadPairs(rebuild, only);
  const outDir = path.join(ROOT, "verify-output", "compare");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const summary: Record<string, unknown>[] = [];
  let flagged = 0;

  for (const width of widths) {
    const viewport = { width, height: 900 };
    const context = await browser.newContext({ viewport });
    const refPage = await context.newPage();
    const buildPage = await context.newPage();
    for (const pair of pairs) {
      let reference: Shot;
      let built: Shot;
      try {
        reference = await capture(refPage, pair.referenceUrl);
        built = await capture(buildPage, pair.rebuildUrl);
      } catch (error) {
        flagged++;
        console.log(
          `FAIL  ${String(width).padStart(4)}  ${pair.label}  could not load: ${(error as Error).message.split("\n")[0]}`,
        );
        continue;
      }
      const common = Math.min(reference.height, built.height);
      const bands = Math.ceil(common / viewport.height);
      const heightDelta = built.height - reference.height;
      const worst: { band: number; ratio: number }[] = [];
      const slug = pair.label.replaceAll("/", "_").replace(/^_|_$/g, "") || "home";
      let total = 0;
      for (let band = 0; band < bands; band++) {
        const top = band * viewport.height;
        const rows = Math.min(viewport.height, common - top);
        const { ratio, diff } = bandDifference(reference, built, top, rows);
        total += ratio * rows;
        if (ratio > threshold) {
          flagged++;
          worst.push({ band, ratio });
          await writeStrip(
            path.join(outDir, `${slug}-${width}-band${band + 1}.png`),
            reference,
            built,
            diff,
            top,
            rows,
          );
        }
      }
      const mean = total / common;
      const status = worst.length === 0 && Math.abs(heightDelta) < 40 ? "ok  " : "DIFF";
      console.log(
        `${status}  ${String(width).padStart(4)}  ${pair.label}  height ${reference.height}→${built.height} (${heightDelta >= 0 ? "+" : ""}${heightDelta}px)  mean diff ${(mean * 100).toFixed(1)}%` +
          (worst.length > 0
            ? `  bands over threshold: ${worst.map((w) => `${w.band + 1} (${(w.ratio * 100).toFixed(0)}%)`).join(", ")}`
            : ""),
      );
      summary.push({
        page: pair.label,
        width,
        referenceHeight: reference.height,
        rebuildHeight: built.height,
        heightDelta,
        meanDiff: mean,
        flaggedBands: worst,
      });
    }
    await context.close();
  }

  await browser.close();
  await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\nStrips (reference | rebuild | diff) and summary.json: ${path.relative(ROOT, outDir)}/`);
  console.log(`${pairs.length * widths.length} comparisons, ${flagged} flagged band(s)/failure(s).`);
  process.exitCode = flagged > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1); // also closes a still-open browser
});
