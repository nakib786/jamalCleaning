/** Routes of the built site, shared by the verify scripts. */
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./site.ts";

/** Path used to request Cloudflare's 404 page. */
export const NOT_FOUND_ROUTE = "/this-page-does-not-exist/";

/** Every built page as a route, e.g. dist/about-us/index.html → /about-us/ (sorted, without the 404). */
export async function builtRoutes(): Promise<string[]> {
  const dist = path.join(ROOT, "dist");
  const routes: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === "index.html") {
        const rel = path.relative(dist, path.dirname(full)).split(path.sep).join("/");
        routes.push(rel ? `/${rel}/` : "/");
      }
    }
  }
  await walk(dist);
  return routes.sort();
}
