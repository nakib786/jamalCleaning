/**
 * Reads the rendered structure and computed styles of a reference page.
 *
 * Walks Elementor containers/sections/widgets (falling back to semantic tags on
 * theme templates) and records, per node: box, non-default computed styles,
 * and leaf content (text with typography, images, icons, links). This is the
 * spec the Astro components are rebuilt from.
 */
import type { Page } from "playwright";

export async function extractOutline(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const BOX_PROPS = [
      "display",
      "position",
      "top",
      "left",
      "right",
      "bottom",
      "z-index",
      "width",
      "max-width",
      "min-height",
      "height",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "background-color",
      "background-image",
      "background-size",
      "background-position",
      "background-repeat",
      "border-top",
      "border-right",
      "border-bottom",
      "border-left",
      "border-radius",
      "box-shadow",
      "flex-direction",
      "flex-wrap",
      "justify-content",
      "align-items",
      "gap",
      "row-gap",
      "column-gap",
      "grid-template-columns",
      "opacity",
      "transform",
      "overflow",
      "backdrop-filter",
      "filter",
    ];
    const TEXT_PROPS = [
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "line-height",
      "letter-spacing",
      "color",
      "text-transform",
      "text-decoration-line",
      "text-align",
      "-webkit-text-stroke-width",
      "-webkit-text-stroke-color",
    ];
    const DEFAULTS: Record<string, string[]> = {
      position: ["static"],
      top: ["auto"],
      left: ["auto"],
      right: ["auto"],
      bottom: ["auto"],
      "z-index": ["auto"],
      "max-width": ["none"],
      "min-height": ["0px", "auto"],
      "background-color": ["rgba(0, 0, 0, 0)"],
      "background-image": ["none"],
      "background-size": ["auto"],
      "background-position": ["0% 0%"],
      "background-repeat": ["repeat"],
      "border-radius": ["0px"],
      "box-shadow": ["none"],
      "flex-direction": ["row"],
      "flex-wrap": ["nowrap"],
      "justify-content": ["normal"],
      "align-items": ["normal"],
      gap: ["normal"],
      "row-gap": ["normal"],
      "column-gap": ["normal"],
      "grid-template-columns": ["none"],
      opacity: ["1"],
      transform: ["none"],
      overflow: ["visible"],
      "backdrop-filter": ["none"],
      filter: ["none"],
      "font-style": ["normal"],
      "letter-spacing": ["normal"],
      "text-transform": ["none"],
      "text-decoration-line": ["none"],
      "-webkit-text-stroke-width": ["0px"],
    };
    for (const side of ["top", "right", "bottom", "left"]) {
      DEFAULTS[`padding-${side}`] = ["0px"];
      DEFAULTS[`margin-${side}`] = ["0px"];
      DEFAULTS[`border-${side}`] = ["0px none rgb(0, 0, 0)", "0px none rgba(0, 0, 0, 0)"];
    }

    const pick = (el: Element, props: string[]): Record<string, string> => {
      const cs = getComputedStyle(el);
      const out: Record<string, string> = {};
      for (const prop of props) {
        const value = cs.getPropertyValue(prop);
        if (!value || DEFAULTS[prop]?.includes(value)) continue;
        if (prop.startsWith("border-") && prop !== "border-radius" && value.startsWith("0px")) continue;
        if (prop === "-webkit-text-stroke-color" && !out["-webkit-text-stroke-width"]) continue;
        out[prop] = value;
      }
      return out;
    };
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left + scrollX),
        y: Math.round(r.top + scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };
    const classes = (el: Element) =>
      [...el.classList]
        .filter((c) => !/^elementor-element-[0-9a-f]+$/.test(c))
        .slice(0, 12)
        .join(" ");
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const ownText = (el: Element) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    type Leaf =
      | {
          kind: "text";
          tag: string;
          cls: string;
          text: string;
          style: Record<string, string>;
          hidden?: boolean;
        }
      | {
          kind: "img";
          src: string;
          srcset?: string;
          alt: string;
          natural: string;
          rendered: string;
          style: Record<string, string>;
        }
      | { kind: "icon"; tag: string; cls: string; svg?: string; style: Record<string, string> }
      | { kind: "link"; href: string; text: string; cls: string; style: Record<string, string> }
      | { kind: "bg"; cls: string; image: string; style: Record<string, string> }
      | { kind: "media"; tag: string; src: string; poster?: string };

    const leaves = (root: Element): Leaf[] => {
      const out: Leaf[] = [];
      // Elements inside an <svg> are rejected (with their subtree); the svg itself is kept.
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n) =>
          (n as SVGElement).ownerSVGElement ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      let node: Node | null = walker.currentNode;
      while (node) {
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === "img") {
          const img = el as HTMLImageElement;
          out.push({
            kind: "img",
            src: img.currentSrc || img.src,
            srcset: img.getAttribute("srcset") ?? undefined,
            alt: img.alt,
            natural: `${img.naturalWidth}x${img.naturalHeight}`,
            rendered: `${Math.round(img.getBoundingClientRect().width)}x${Math.round(img.getBoundingClientRect().height)}`,
            style: pick(el, ["border-radius", "object-fit", "opacity", "filter", "transform", "box-shadow"]),
          });
        } else if (tag === "video" || tag === "iframe" || tag === "source") {
          out.push({
            kind: "media",
            tag,
            src: el.getAttribute("src") ?? "",
            poster: el.getAttribute("poster") ?? undefined,
          });
        } else if (tag === "svg" || (tag === "i" && el.className)) {
          out.push({
            kind: "icon",
            tag,
            cls: typeof el.className === "string" ? el.className : (el.getAttribute("class") ?? ""),
            svg: tag === "svg" ? el.outerHTML.slice(0, 1500) : undefined,
            style: pick(el, [
              "font-size",
              "width",
              "height",
              "color",
              "fill",
              "background-color",
              "border-radius",
            ]),
          });
        } else {
          if (tag === "a") {
            out.push({
              kind: "link",
              href: el.getAttribute("href") ?? "",
              text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
              cls: classes(el),
              style: pick(el, [
                ...TEXT_PROPS,
                "background-color",
                "padding-top",
                "padding-right",
                "padding-bottom",
                "padding-left",
                "border-radius",
                "border-top",
                "border-bottom",
              ]),
            });
          }
          const text = ownText(el);
          if (text && !["script", "style", "noscript"].includes(tag)) {
            out.push({
              kind: "text",
              tag,
              cls: classes(el),
              text: text.slice(0, 2000),
              style: pick(el, TEXT_PROPS),
              hidden: visible(el) ? undefined : true,
            });
          }
          const bg = getComputedStyle(el).backgroundImage;
          if (bg && bg !== "none" && el !== root) {
            out.push({
              kind: "bg",
              cls: classes(el),
              image: bg.slice(0, 600),
              style: pick(el, ["background-size", "background-position", "background-color", "opacity"]),
            });
          }
        }
        node = walker.nextNode();
      }
      return out;
    };

    type Block = {
      tag: string;
      id?: string;
      cls: string;
      type: string;
      settings?: string;
      rect: { x: number; y: number; w: number; h: number };
      style: Record<string, string>;
      hidden?: boolean;
      leaves?: Leaf[];
      children?: Block[];
    };

    const isElementorNode = (el: Element) => el.hasAttribute("data-element_type");
    const walk = (el: Element, depth: number): Block => {
      const type =
        el.getAttribute("data-widget_type") ??
        el.getAttribute("data-element_type") ??
        el.tagName.toLowerCase();
      const block: Block = {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        cls: classes(el),
        type,
        settings: el.getAttribute("data-settings") ?? undefined,
        rect: rect(el),
        style: pick(el, BOX_PROPS),
        hidden: visible(el) ? undefined : true,
      };
      const isWidget = el.getAttribute("data-element_type") === "widget";
      if (isWidget || depth > 14) {
        block.leaves = leaves(el);
        return block;
      }
      // Elementor children are not always direct children (e.g. .e-con-inner wrappers).
      const kids: Element[] = [];
      const collect = (parent: Element) => {
        for (const child of parent.children) {
          if (isElementorNode(child)) kids.push(child);
          else collect(child);
        }
      };
      collect(el);
      if (kids.length > 0) block.children = kids.map((k) => walk(k, depth + 1));
      else block.leaves = leaves(el);
      return block;
    };

    const regionRoots = (): { region: string; el: Element }[] => {
      const found: { region: string; el: Element }[] = [];
      const header =
        document.querySelector('[data-elementor-type="header"]') ?? document.querySelector("header");
      const footer =
        document.querySelector('[data-elementor-type="footer"]') ?? document.querySelector("footer");
      if (header) found.push({ region: "header", el: header });
      const mains = [...document.querySelectorAll("[data-elementor-type]")].filter(
        (el) =>
          el !== header &&
          el !== footer &&
          !header?.contains(el) &&
          !footer?.contains(el) &&
          !el.parentElement?.closest("[data-elementor-type]"),
      );
      for (const el of mains)
        found.push({
          region: `elementor:${el.getAttribute("data-elementor-type")}#${el.getAttribute("data-elementor-id")}`,
          el,
        });
      const main = document.querySelector("#content, main, .site-content");
      if (main) found.push({ region: "theme-main", el: main });
      if (footer) found.push({ region: "footer", el: footer });
      return found;
    };

    const regions = regionRoots().map(({ region, el }) => {
      if (region === "theme-main") {
        // Theme template parts (page title bar, sidebars, blog loops) outside Elementor documents.
        const parts = [...el.querySelectorAll(":scope > *, :scope > * > *")]
          .filter((c) => !c.closest("[data-elementor-type]") && !c.querySelector("[data-elementor-type]"))
          .slice(0, 40);
        return {
          region,
          rect: rect(el),
          style: pick(el, BOX_PROPS),
          parts: parts.map((p) => ({
            tag: p.tagName.toLowerCase(),
            cls: classes(p),
            rect: rect(p),
            style: pick(p, BOX_PROPS),
            leaves: leaves(p),
          })),
        };
      }
      return { region, block: walk(el, 0) };
    });

    const cssVars: Record<string, string> = {};
    const bodyStyle = getComputedStyle(document.body);
    for (let i = 0; i < bodyStyle.length; i++) {
      const name = bodyStyle.item(i);
      if (name.startsWith("--")) cssVars[name] = bodyStyle.getPropertyValue(name).trim();
    }
    const media = new Set<string>();
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of [...rules]) if (rule instanceof CSSMediaRule) media.add(rule.conditionText);
    }
    const meta = (sel: string) => document.querySelector(sel)?.getAttribute("content") ?? undefined;
    const w = window as unknown as { elementorFrontendConfig?: { responsive?: unknown; kit?: unknown } };
    return {
      url: location.href,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight },
      documentHeight: (document.scrollingElement ?? document.documentElement).scrollHeight,
      bodyClass: document.body.className,
      meta: {
        description: meta('meta[name="description"]'),
        ogTitle: meta('meta[property="og:title"]'),
        ogDescription: meta('meta[property="og:description"]'),
        ogImage: meta('meta[property="og:image"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? undefined,
      },
      bodyStyle: pick(document.body, [...TEXT_PROPS, "background-color"]),
      fonts: [...document.fonts]
        .filter((f) => f.status === "loaded")
        .map((f) => `${f.family} ${f.weight} ${f.style}`),
      elementor: { responsive: w.elementorFrontendConfig?.responsive, kit: w.elementorFrontendConfig?.kit },
      mediaQueries: [...media].sort(),
      cssVars,
      regions,
    };
  });
}
