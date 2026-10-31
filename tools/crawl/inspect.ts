/**
 * Step 1b — per-page reference capture.
 *
 * For every in-scope page in reference/discovery.json, at 1440, 768 and 390 px:
 *   - loads the page in the shared Chrome and scrolls slowly (lazy content, animations)
 *   - saves the HTML, CSS, JS and font responses under captured/ (+ captured/manifest.json)
 *   - full-page screenshot   -> reference/screenshots/<slug>/<width>.png
 *   - computed-style outline -> reference/outline/<slug>.<width>.json
 * and at 1440 px only:
 *   - rendered DOM           -> reference/html/<slug>.html
 *   - REA inspect_web_page + analyze_web_bundle -> reference/rea/<slug>.{inspect,bundle}.json
 *
 * Usage: tsx tools/crawl/inspect.ts [--only=slug,slug] [--widths=1440,768,390] [--no-rea]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { connect, load, openPage, slowScroll, targetIdOf } from "../lib/browser.ts";
import { CaptureStore } from "../lib/capture-store.ts";
import { extractOutline } from "../lib/outline.ts";
import { ReaClient } from "../lib/rea.ts";
import { CAPTURED_DIR, CDP_ENDPOINT, REFERENCE_DIR, politeDelay } from "../lib/site.ts";

interface DiscoveredPage {
  url: string;
  slug: string;
  status: number;
  inBuild?: boolean;
  bundle?: boolean;
}

interface InspectEvidence {
  normalized_result?: {
    target?: unknown;
    completeness?: { status?: string };
    scripts?: { total?: number; items?: { url?: string; length?: number; is_module?: boolean }[] };
    resources?: { url?: string; type?: string; mime_type?: string; content_size?: number }[];
    console?: { events?: unknown[] };
    limitations?: string[];
  };
}

/** Keep the asset inventory from REA's evidence; drop the DOM/accessibility trees. */
function compactInspect(data: Record<string, unknown>): unknown {
  const n = (data as InspectEvidence).normalized_result;
  if (!n) return data;
  return {
    evidence_id: data.evidence_id,
    target: n.target,
    completeness: n.completeness?.status,
    scripts: n.scripts?.items?.map((s) => ({ url: s.url, length: s.length, module: s.is_module })),
    resources: n.resources?.map((r) => ({ url: r.url, type: r.type, mime: r.mime_type, size: r.content_size })),
    console: n.console?.events,
    limitations: n.limitations,
  };
}

const VIEWPORT_HEIGHT: Record<number, number> = { 1440: 900, 768: 1024, 390: 844 };

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 1)}\n`);
}

async function main(): Promise<void> {
  const discovery = JSON.parse(await fs.readFile(path.join(REFERENCE_DIR, "discovery.json"), "utf8")) as {
    pages: DiscoveredPage[];
  };
  const only = arg("only")?.split(",");
  const widths = (arg("widths") ?? "1440,768,390").split(",").map(Number);
  const useRea = !process.argv.includes("--no-rea");
  const extra = arg("include")?.split(",") ?? [];
  const pages = discovery.pages.filter(
    (p) => (only ? only.includes(p.slug) : p.inBuild !== false) || extra.includes(p.slug),
  );

  const store = new CaptureStore((type) => ["document", "stylesheet", "script", "font"].includes(type));
  const manifestFile = path.join(CAPTURED_DIR, "manifest.json");
  await store.load(manifestFile);

  const rea = new ReaClient();
  if (useRea) await rea.start();
  const session = await connect();
  const reaLog: { slug: string; tool: string; ok: boolean; note?: string }[] = [];

  let first = true;
  for (const ref of pages) {
    for (const width of widths) {
      if (!first) await politeDelay();
      first = false;
      const page = await openPage(session, width, VIEWPORT_HEIGHT[width] ?? 900);
      const stop = store.attach(page, { slug: ref.slug, width });
      try {
        const status = await load(page, ref.url);
        await slowScroll(page);
        await stop();
        console.log(`${ref.slug} @${width}: HTTP ${status}`);

        const outline = (await extractOutline(page)) as { documentHeight: number };
        await writeJson(path.join(REFERENCE_DIR, "outline", `${ref.slug}.${width}.json`), outline);
        const shotDir = path.join(REFERENCE_DIR, "screenshots", ref.slug);
        await fs.mkdir(shotDir, { recursive: true });
        // Off-canvas panels overflow sideways; clip to the viewport width like a real visitor sees it.
        await page.screenshot({
          path: path.join(shotDir, `${width}.jpg`),
          type: "jpeg",
          quality: 80,
          fullPage: true,
          clip: { x: 0, y: 0, width, height: outline.documentHeight },
          animations: "disabled",
        });

        if (width === 1440) {
          const htmlFile = path.join(REFERENCE_DIR, "html", `${ref.slug}.html`);
          await fs.mkdir(path.dirname(htmlFile), { recursive: true });
          await fs.writeFile(htmlFile, await page.content());

          if (useRea) {
            const targetId = await targetIdOf(page);
            const origins = [
              ...new Set(
                [...store.entries.values()].filter((e) => e.pages.includes(ref.slug)).map((e) => new URL(e.url).origin),
              ),
            ];
            const base = { cdp_endpoint: CDP_ENDPOINT, target_id: targetId, allowed_origins: origins };
            const inspect = await rea.call("inspect_web_page", { ...base, observation_ms: 1500, include_console_text: true });
            await writeJson(path.join(REFERENCE_DIR, "rea", "full", `${ref.slug}.inspect.json`), inspect.data);
            await writeJson(path.join(REFERENCE_DIR, "rea", `${ref.slug}.inspect.json`), compactInspect(inspect.data));
            reaLog.push({ slug: ref.slug, tool: "inspect_web_page", ok: !inspect.isError });

            // Script bundles are shared by every page of a template: analyze one representative each.
            if (ref.bundle) {
              const bundle = await rea.call("analyze_web_bundle", base, 900_000);
              await writeJson(path.join(REFERENCE_DIR, "rea", "full", `${ref.slug}.bundle.json`), bundle.data);
              reaLog.push({ slug: ref.slug, tool: "analyze_web_bundle", ok: !bundle.isError });
            }
          }
        }
      } catch (error) {
        await stop();
        console.warn(`${ref.slug} @${width} failed: ${(error as Error).message}`);
      } finally {
        await page.close();
      }
      await store.write(manifestFile);
    }
  }

  if (useRea) {
    rea.stop();
    await writeJson(path.join(REFERENCE_DIR, "rea", "_log.json"), reaLog);
  }
  console.log(`done: ${store.entries.size} files in manifest, ${store.failures.size} failures`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
