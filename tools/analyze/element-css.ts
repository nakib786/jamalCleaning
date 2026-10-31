/**
 * Shows every CSS rule that targets one Elementor element, grouped by media query.
 *
 * Finds the element in the rendered reference DOM by text (or data-id), walks up to
 * the nearest widget/container, and greps the page's captured stylesheets for its
 * `.elementor-element-<id>` rules — the exact per-breakpoint values the rebuild needs.
 *
 * Usage: tsx tools/analyze/element-css.ts <slug> "<text or #data-id>" [--up=N] [--all]
 *   --up=N   use the Nth Elementor ancestor (0 = nearest)
 *   --all    also print rules of descendants
 */
import fs from "node:fs";
import path from "node:path";
import { parse, type HTMLElement } from "node-html-parser";
import postcss, { type AtRule, type Rule } from "postcss";
import { CAPTURED_DIR, REFERENCE_DIR } from "../lib/site.ts";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [slug, needle] = args;
if (!slug || !needle) {
  console.error('usage: element-css.ts <slug> "<text or #data-id>" [--up=N] [--all]');
  process.exit(1);
}
const up = Number(process.argv.find((a) => a.startsWith("--up="))?.split("=")[1] ?? 0);
const includeDescendants = process.argv.includes("--all");

const html = fs.readFileSync(path.join(REFERENCE_DIR, "html", `${slug}.html`), "utf8");
const root = parse(html);

let target: HTMLElement | null = null;
if (needle.startsWith("#")) {
  target = root.querySelector(`[data-id="${needle.slice(1)}"]`);
} else {
  const lower = needle.toLowerCase();
  const candidates = root
    .querySelectorAll("[data-id]")
    .filter((el) => el.getAttribute("data-element_type") === "widget" && el.text.toLowerCase().includes(lower));
  target = candidates.sort((a, b) => a.text.length - b.text.length)[0] ?? null;
}
if (!target) {
  console.error("element not found");
  process.exit(1);
}
for (let i = 0; i < up; i++) {
  let parent = target.parentNode as HTMLElement | null;
  while (parent && !parent.getAttribute?.("data-id")) parent = parent.parentNode as HTMLElement | null;
  if (!parent) break;
  target = parent;
}

const ids = new Set<string>([target.getAttribute("data-id") ?? ""]);
if (includeDescendants) for (const el of target.querySelectorAll("[data-id]")) ids.add(el.getAttribute("data-id") ?? "");
console.log(
  `element ${target.getAttribute("data-id")} type=${target.getAttribute("data-widget_type") ?? target.getAttribute("data-element_type")} class="${target.getAttribute("class")?.slice(0, 160)}"`,
);
const settings = target.getAttribute("data-settings");
if (settings) console.log(`settings: ${settings.replace(/&quot;/g, '"').slice(0, 1200)}`);

// Stylesheets the page loaded, resolved to captured files.
const manifest = JSON.parse(fs.readFileSync(path.join(CAPTURED_DIR, "manifest.json"), "utf8")) as {
  entries: { url: string; file: string; type: string; pages: string[] }[];
};
const sheets = manifest.entries.filter((e) => e.type === "stylesheet" && e.pages.includes(slug) && /elementor\/css\/post-/.test(e.url));

const byMedia = new Map<string, string[]>();
for (const sheet of sheets) {
  const css = fs.readFileSync(path.join(CAPTURED_DIR, "..", sheet.file), "utf8");
  postcss.parse(css).walkRules((rule: Rule) => {
    const hit = [...ids].some((id) => id && rule.selector.includes(`elementor-element-${id}`));
    if (!hit) return;
    const media = rule.parent?.type === "atrule" ? `@media ${(rule.parent as AtRule).params}` : "(all)";
    const decls = rule.nodes
      .filter((n) => n.type === "decl")
      .map((n) => `${(n as unknown as { prop: string }).prop}:${(n as unknown as { value: string }).value}`)
      .join("; ");
    const sel = rule.selector.replace(/\.elementor-\d+ /g, "").replace(/\s+/g, " ");
    const list = byMedia.get(media) ?? [];
    list.push(`  ${sel.slice(0, 170)} { ${decls} }`);
    byMedia.set(media, list);
  });
}
for (const [media, list] of byMedia) {
  console.log(`\n${media}`);
  for (const line of list) console.log(line);
}
