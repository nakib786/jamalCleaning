/**
 * Prints a compact, human-readable view of a reference outline
 * (reference/outline/<slug>.<width>.json) for rebuilding sections.
 *
 * Usage: tsx tools/analyze/outline-summary.ts <slug> [width=1440] [--region=header|footer|elementor] [--depth=6] [--from=y] [--to=y]
 */
import fs from "node:fs";
import path from "node:path";
import { REFERENCE_DIR } from "../lib/site.ts";

interface Leaf {
  kind: string;
  tag?: string;
  cls?: string;
  text?: string;
  src?: string;
  alt?: string;
  rendered?: string;
  href?: string;
  image?: string;
  svg?: string;
  hidden?: boolean;
  style?: Record<string, string>;
}

interface Block {
  type: string;
  cls: string;
  tag: string;
  rect: { x: number; y: number; w: number; h: number };
  style: Record<string, string>;
  hidden?: boolean;
  settings?: string;
  leaves?: Leaf[];
  children?: Block[];
}

const [slug = "home-4", widthArg = "1440"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const opt = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const maxDepth = Number(opt("depth") ?? 8);
const from = Number(opt("from") ?? -1);
const to = Number(opt("to") ?? Number.POSITIVE_INFINITY);
const regionFilter = opt("region");

const outline = JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, "outline", `${slug}.${widthArg}.json`), "utf8")) as {
  regions: { region: string; block?: Block; parts?: { tag: string; cls: string; rect: Block["rect"]; style: Record<string, string>; leaves: Leaf[] }[] }[];
};

const font = (s: Record<string, string> = {}) => {
  const fam = (s["font-family"] ?? "").replace(/"/g, "").split(",")[0];
  const bits = [
    fam && fam !== "Roboto Flex" ? fam : "",
    s["font-size"],
    s["font-weight"] && s["font-weight"] !== "400" ? `w${s["font-weight"]}` : "",
    s["line-height"] ? `lh${s["line-height"]}` : "",
    s["letter-spacing"] ? `ls${s["letter-spacing"]}` : "",
    s.color ? s.color.replace(/rgb\((\d+), (\d+), (\d+)\)/, (_m, r: string, g: string, b: string) => `#${[r, g, b].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`) : "",
    s["text-transform"] ?? "",
    s["text-align"] && s["text-align"] !== "start" ? `align:${s["text-align"]}` : "",
  ];
  return bits.filter(Boolean).join(" ");
};

const box = (s: Record<string, string>) => {
  const pad = ["padding-top", "padding-right", "padding-bottom", "padding-left"].map((k) => s[k] ?? "0").join(" ");
  const mar = ["margin-top", "margin-right", "margin-bottom", "margin-left"].map((k) => s[k] ?? "0").join(" ");
  const bits = [
    s["background-color"] ? `bg:${s["background-color"]}` : "",
    s["background-image"] ? `bgimg:${s["background-image"].slice(0, 110)}` : "",
    pad !== "0 0 0 0" ? `pad:${pad}` : "",
    mar !== "0 0 0 0" ? `mar:${mar}` : "",
    s["border-radius"] ? `r:${s["border-radius"]}` : "",
    s["max-width"] ? `maxw:${s["max-width"]}` : "",
    s["min-height"] ? `minh:${s["min-height"]}` : "",
    s.display && s.display !== "block" ? s.display : "",
    s["flex-direction"] && s["flex-direction"] !== "row" ? s["flex-direction"] : "",
    s.gap ? `gap:${s.gap}` : "",
    s["justify-content"] ? `jc:${s["justify-content"]}` : "",
    s["align-items"] ? `ai:${s["align-items"]}` : "",
    s["grid-template-columns"] ? `cols:${s["grid-template-columns"]}` : "",
    s.position && s.position !== "static" ? `pos:${s.position}` : "",
    s["box-shadow"] ? `shadow:${s["box-shadow"]}` : "",
    s["border-top"] ? `bt:${s["border-top"]}` : "",
    s["border-bottom"] ? `bb:${s["border-bottom"]}` : "",
    s.overflow ? `of:${s.overflow}` : "",
    s.transform ? `tf:${s.transform}` : "",
    s.opacity ? `op:${s.opacity}` : "",
  ];
  return bits.filter(Boolean).join(" ");
};

const leafLine = (l: Leaf): string | null => {
  if (l.hidden) return null;
  switch (l.kind) {
    case "text":
      return `T <${l.tag}${l.cls ? `.${l.cls.split(" ")[0]}` : ""}> "${(l.text ?? "").slice(0, 160)}" [${font(l.style)}]`;
    case "img":
      return `IMG ${(l.src ?? "").replace(/^https:\/\/demo2\.pavothemes\.com\/cetro\/wp-content\/uploads\//, "")} ${l.rendered} alt="${l.alt}"${l.style?.["border-radius"] ? ` r:${l.style["border-radius"]}` : ""}`;
    case "icon":
      return `ICON ${l.tag} ${(l.cls ?? "").slice(0, 60)} ${l.style?.["font-size"] ?? ""} ${l.style?.color ?? ""}`;
    case "link":
      return `A ${l.href} ${l.text ? `"${l.text.slice(0, 40)}"` : ""} ${l.style?.["background-color"] ? `bg:${l.style["background-color"]}` : ""} ${l.style?.["border-radius"] ? `r:${l.style["border-radius"]}` : ""}`;
    case "bg":
      return `BG .${(l.cls ?? "").split(" ")[0]} ${(l.image ?? "").slice(0, 140)}`;
    case "media":
      return `MEDIA ${l.tag} ${l.src}`;
    default:
      return null;
  }
};

const print = (b: Block, depth: number): void => {
  // Zero-size wrappers (e.g. an absolutely positioned header) are still walked.
  const zeroSize = b.rect.w === 0 || b.rect.h === 0;
  if (!zeroSize && (b.rect.y + b.rect.h < from || b.rect.y > to)) return;
  if (b.hidden && !zeroSize && process.argv.includes("--visible")) return;
  const pad = "  ".repeat(depth);
  const type = b.type.replace(".default", "");
  console.log(`${pad}${b.hidden ? "(hidden) " : ""}${type} {${b.cls.split(" ").filter((c) => !/^(e-con|e-flex|e-parent|e-child|elementor-widget|elementor-element|e-con-full|e-con-boxed|e-lazyloaded)$/.test(c)).slice(0, 4).join(" ")}} @${b.rect.x},${b.rect.y} ${b.rect.w}x${b.rect.h} ${box(b.style)}`);
  if (depth >= maxDepth) return;
  for (const l of b.leaves ?? []) {
    const line = leafLine(l);
    if (line) console.log(`${pad}  · ${line}`);
  }
  for (const c of b.children ?? []) print(c, depth + 1);
};

for (const r of outline.regions) {
  if (regionFilter && !r.region.startsWith(regionFilter)) continue;
  console.log(`\n===== ${r.region} =====`);
  if (r.block) print(r.block, 0);
  for (const p of r.parts ?? []) {
    if (p.rect.y + p.rect.h < from || p.rect.y > to) continue;
    console.log(`${p.tag}.${p.cls.split(" ")[0]} @${p.rect.x},${p.rect.y} ${p.rect.w}x${p.rect.h} ${box(p.style)}`);
    for (const l of p.leaves.slice(0, 60)) {
      const line = leafLine(l);
      if (line) console.log(`  · ${line}`);
    }
  }
}
