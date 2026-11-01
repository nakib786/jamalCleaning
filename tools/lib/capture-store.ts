/**
 * Saves network responses to captured/<host>/<path> and keeps a manifest.
 *
 * - `?ver=` cache-busters are dropped from file names; other queries get a short hash.
 * - Different bodies for the same path are kept side by side with a content-hash suffix.
 * - Redirects, failed requests and non-2xx responses are recorded as failures.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Page, Request, Response } from "playwright";
import { CAPTURED_DIR, ROOT } from "./site.ts";

export interface ManifestEntry {
  url: string;
  file: string;
  type: string;
  contentType: string;
  size: number;
  status: number;
  sha256: string;
  pages: string[];
  widths: number[];
}

export interface Failure {
  url: string;
  type: string;
  reason: string;
  pages: string[];
  widths: number[];
}

export interface CaptureContext {
  slug: string;
  width: number;
}

const MAX_PATH = 240;

function addUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

function shortHash(value: string | Buffer, length = 8): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, length);
}

function sanitize(segment: string): string {
  // Control characters are invalid in Windows file names, so the range is intentional.
  // eslint-disable-next-line no-control-regex
  return decodeURIComponent(segment).replace(/[<>:"\\|?*\u0000-\u001f]/g, "_");
}

/** captured/<host>/<path>, with an index.html for directory URLs. */
export function fileFor(rawUrl: string, contentType: string): string {
  const url = new URL(rawUrl);
  const segments = url.pathname.split("/").filter(Boolean).map(sanitize);
  let name = segments.pop() ?? "";
  const isHtml = contentType.includes("text/html");
  if (url.pathname.endsWith("/") || name === "") {
    if (name) segments.push(name);
    name = isHtml ? "index.html" : "index";
  } else if (isHtml && !/\.[a-z0-9]{2,5}$/i.test(name)) {
    segments.push(name);
    name = "index.html";
  }
  const query = [...url.searchParams.keys()].filter((key) => key !== "ver");
  if (query.length > 0) {
    const ext = path.extname(name);
    name = `${path.basename(name, ext)}@q${shortHash(url.search)}${ext}`;
  }
  let file = path.join(CAPTURED_DIR, sanitize(url.host), ...segments, name);
  if (file.length > MAX_PATH) {
    const ext = path.extname(name);
    file = path.join(CAPTURED_DIR, sanitize(url.host), "_long", `${shortHash(rawUrl, 16)}${ext}`);
  }
  return file;
}

export class CaptureStore {
  readonly entries = new Map<string, ManifestEntry>();
  readonly failures = new Map<string, Failure>();
  private readonly fileHashes = new Map<string, string>();

  constructor(private readonly keep: (resourceType: string) => boolean = () => true) {}

  /** Start recording a page; the returned function stops and waits for pending writes. */
  attach(page: Page, ctx: CaptureContext): () => Promise<void> {
    const pending: Promise<void>[] = [];
    const onResponse = (response: Response): void => {
      pending.push(
        this.save(response, ctx).catch((error: unknown) =>
          this.fail(response.request(), `body unavailable: ${String(error)}`, ctx),
        ),
      );
    };
    const onFailed = (request: Request): void => {
      this.fail(request, request.failure()?.errorText ?? "request failed", ctx);
    };
    page.on("response", onResponse);
    page.on("requestfailed", onFailed);
    return async () => {
      page.off("response", onResponse);
      page.off("requestfailed", onFailed);
      await Promise.allSettled(pending);
    };
  }

  async load(manifestFile: string): Promise<void> {
    try {
      const data = JSON.parse(await fs.readFile(manifestFile, "utf8")) as {
        entries: ManifestEntry[];
        failures: Failure[];
      };
      for (const entry of data.entries) {
        this.entries.set(entry.url, entry);
        this.fileHashes.set(path.join(ROOT, entry.file), entry.sha256);
      }
      for (const failure of data.failures) this.failures.set(`${failure.url} ${failure.reason}`, failure);
    } catch {
      // first run: nothing to merge
    }
  }

  async write(manifestFile: string): Promise<void> {
    const entries = [...this.entries.values()].sort((a, b) => a.url.localeCompare(b.url));
    // A failure that later succeeded (e.g. at another width) is not a failure.
    const failures = [...this.failures.values()]
      .filter((f) => !this.entries.has(f.url))
      .sort((a, b) => a.url.localeCompare(b.url));
    const totals = {
      files: entries.length,
      bytes: entries.reduce((sum, e) => sum + e.size, 0),
      failures: failures.length,
    };
    await fs.mkdir(path.dirname(manifestFile), { recursive: true });
    await fs.writeFile(
      manifestFile,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), totals, entries, failures }, null, 2)}\n`,
    );
  }

  private async save(response: Response, ctx: CaptureContext): Promise<void> {
    const request = response.request();
    const url = response.url();
    const type = request.resourceType();
    if (!/^https?:/.test(url) || !this.keep(type)) return;
    const status = response.status();
    if (status >= 300 && status < 400) {
      this.fail(request, `redirect ${status} -> ${(await response.headerValue("location")) ?? "?"}`, ctx);
      return;
    }
    if (status >= 400) {
      this.fail(request, `HTTP ${status}`, ctx);
      return;
    }
    const known = this.entries.get(url);
    if (known) {
      addUnique(known.pages, ctx.slug);
      addUnique(known.widths, ctx.width);
      return;
    }
    const body = await response.body();
    const contentType = (await response.headerValue("content-type")) ?? "";
    const sha256 = crypto.createHash("sha256").update(body).digest("hex");
    let file = fileFor(url, contentType);
    const existing = this.fileHashes.get(file);
    if (existing && existing !== sha256) {
      const ext = path.extname(file);
      file = `${file.slice(0, file.length - ext.length)}@${sha256.slice(0, 8)}${ext}`;
    }
    if (this.fileHashes.get(file) !== sha256) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body);
      this.fileHashes.set(file, sha256);
    }
    this.entries.set(url, {
      url,
      file: path.relative(ROOT, file).replace(/\\/g, "/"),
      type,
      contentType,
      size: body.length,
      status,
      sha256,
      pages: [ctx.slug],
      widths: [ctx.width],
    });
  }

  private fail(request: Request, reason: string, ctx: CaptureContext): void {
    const url = request.url();
    if (!/^https?:/.test(url) || !this.keep(request.resourceType())) return;
    const key = `${url} ${reason}`;
    const failure = this.failures.get(key) ?? {
      url,
      type: request.resourceType(),
      reason,
      pages: [],
      widths: [],
    };
    addUnique(failure.pages, ctx.slug);
    addUnique(failure.widths, ctx.width);
    this.failures.set(key, failure);
  }
}
