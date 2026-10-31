/**
 * Step 2 helper — download full-size originals of every image a page uses.
 *
 * The browser only requests the srcset candidate that fits its viewport, so the
 * Playwright capture can miss the largest file. This reads the reference
 * outlines (img src/srcset and CSS background images) and fetches the largest
 * candidate of each image, one request per second, into captured/<host>/<path>
 * (own manifest: captured/manifest.originals.json, merged into
 * captured/manifest.json by the Step 2 capture so concurrent crawls never clobber each other).
 *
 * Usage: tsx tools/crawl/fetch-originals.ts [--only=slug,slug]
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileFor, type ManifestEntry } from "../lib/capture-store.ts";
import { CAPTURED_DIR, DEMO_ORIGIN, REFERENCE_DIR, ROOT, sleep } from "../lib/site.ts";

interface Leaf {
  kind: string;
  src?: string;
  srcset?: string;
  image?: string;
  svg?: string;
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

/** Largest candidate of a srcset ("url 300w, url 1024w"). */
function largest(srcset: string): string | undefined {
  return srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/))
    .map(([url, size]) => ({ url, w: Number.parseInt(size ?? "0", 10) || 0 }))
    .sort((a, b) => b.w - a.w)[0]?.url;
}

/** WordPress size variants end in -<w>x<h>; the original drops that suffix. */
function originalOf(url: string): string {
  return url.replace(/-\d{2,5}x\d{2,5}(\.(jpe?g|png|webp|gif))$/i, "$1");
}

function collect(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const leaf = node as Leaf & Record<string, unknown>;
  if (leaf.kind === "img") {
    if (leaf.src) out.add(leaf.src);
    if (leaf.srcset) {
      const big = largest(leaf.srcset);
      if (big) out.add(big);
    }
  }
  if (leaf.kind === "bg" && leaf.image) {
    for (const m of leaf.image.matchAll(/url\("?([^")]+)"?\)/g)) if (m[1]) out.add(m[1]);
  }
  const style = (leaf as { style?: Record<string, string> }).style;
  const bg = style?.["background-image"];
  if (bg) for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) if (m[1]) out.add(m[1]);
  for (const value of Object.values(leaf)) if (value && typeof value === "object") collect(value, out);
}

async function main(): Promise<void> {
  const only = arg("only")?.split(",");
  const outlineDir = path.join(REFERENCE_DIR, "outline");
  const files = (await fs.readdir(outlineDir)).filter((f) => f.endsWith(".json"));
  const urls = new Map<string, Set<string>>();
  for (const file of files) {
    const slug = file.replace(/\.\d+\.json$/, "");
    if (only && !only.includes(slug)) continue;
    const found = new Set<string>();
    collect(JSON.parse(await fs.readFile(path.join(outlineDir, file), "utf8")), found);
    for (const raw of found) {
      let url: string;
      try {
        url = new URL(raw, DEMO_ORIGIN).toString();
      } catch {
        continue;
      }
      if (!url.startsWith(`${DEMO_ORIGIN}/cetro/wp-content/`)) continue;
      // Ask for the original too; it 404s harmlessly when the variant is the original.
      for (const candidate of new Set([url, originalOf(url)])) {
        const pages = urls.get(candidate) ?? new Set<string>();
        pages.add(slug);
        urls.set(candidate, pages);
      }
    }
  }

  const manifestFile = path.join(CAPTURED_DIR, "manifest.originals.json");
  const mainManifest = JSON.parse(
    await fs.readFile(path.join(CAPTURED_DIR, "manifest.json"), "utf8").catch(() => "{\"entries\":[]}"),
  ) as { entries: ManifestEntry[] };
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8").catch(() => '{"entries":[],"failures":[]}')) as {
    entries: ManifestEntry[];
    failures: { url: string; type: string; reason: string; pages: string[]; widths: number[] }[];
  };
  const known = new Map([...mainManifest.entries, ...manifest.entries].map((e) => [e.url, e]));
  let fetched = 0;
  for (const [url, pages] of urls) {
    const existing = known.get(url);
    if (existing) {
      for (const p of pages) if (!existing.pages.includes(p)) existing.pages.push(p);
      continue;
    }
    await sleep(1000);
    const res = await fetch(url, { headers: { "user-agent": "jamal-cleaning-site asset sync (licensed Cetro theme)" } });
    if (!res.ok) {
      if (url !== originalOf(url) || res.status !== 404) {
        manifest.failures.push({ url, type: "image", reason: `HTTP ${res.status}`, pages: [...pages], widths: [] });
      }
      continue;
    }
    const body = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "";
    const file = fileFor(url, contentType);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    const entry: ManifestEntry = {
      url,
      file: path.relative(ROOT, file).replace(/\\/g, "/"),
      type: "image",
      contentType,
      size: body.length,
      status: res.status,
      sha256: crypto.createHash("sha256").update(body).digest("hex"),
      pages: [...pages],
      widths: [],
    };
    manifest.entries.push(entry);
    known.set(url, entry);
    fetched++;
    if (fetched % 10 === 0) console.log(`${fetched} images fetched…`);
  }
  manifest.entries.sort((a, b) => a.url.localeCompare(b.url));
  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`fetched ${fetched} images (${urls.size} candidates)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
