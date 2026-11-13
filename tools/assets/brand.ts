/**
 * Generates brand assets from the source logo (src/assets/brand/logo-source.svg): a gold crest —
 * wings, crown and a shield holding a "J". The SVG is exported with a solid white background
 * rectangle; it is dropped here so every output is transparent. The crest has no wordmark: the
 * site sets the business name next to it in HTML (src/components/layout/Logo.astro).
 *
 * Outputs:
 *   src/assets/brand/logo-mark.png     crest, trimmed (header, footer, mobile menu)
 *   src/assets/brand/og-image.jpg      1200×630 social share image (crest on the brand navy)
 *   public/logo.png                    600px crest for structured data
 *   public/favicon.ico, favicon-32.png shield + "J" only (the full crest is unreadable at 16–32px)
 *   public/apple-touch-icon.png        crest on navy (iOS needs an opaque icon)
 *   public/icon-192.png, icon-512.png  crest, transparent (web app manifest)
 *
 * Re-run after replacing the logo: `npx tsx tools/assets/brand.ts`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "../lib/site.ts";

const BRAND = path.join(ROOT, "src/assets/brand");
const PUBLIC = path.join(ROOT, "public");
/** Dark navy (`--color-teal` in global.css) behind the crest on the share image and iOS icon. */
const NAVY = { r: 28, g: 36, b: 48, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
/** Render size of the master bitmap (the SVG's viewBox is 1500 × 1500). */
const MASTER = 1500;
/**
 * Outer outline of the shield, in viewBox units (copied from the SVG's shield clip path). Used to
 * cut the favicon mark out cleanly, without the wing tips that reach into its bounding box.
 */
const SHIELD_OUTLINE =
  "M 748.6 1431 L 591.2 1324 C 481.5 1249.4 416 1125.7 416 993.1 L 416 474.1 L 505.2 474.1 L 748.6 373 " +
  "L 751.5 374.2 L 992 474.1 L 1081.2 474.1 L 1081.2 993.1 C 1081.2 1125.7 1015.7 1249.4 906 1324 Z";

/** Minimal ICO container holding PNG images (supported by all modern browsers). */
function ico(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

/** Drop the full-canvas white background rectangle that the SVG export puts behind the artwork. */
function withoutBackground(svg: string): string {
  const background = /<rect\b[^>]*\bfill="(?:#fff|#ffffff|white)"[^>]*\/>/i;
  const match = background.exec(svg);
  if (!match || !/\bwidth="(\d{4,})/.test(match[0])) {
    throw new Error("Expected a full-canvas white background <rect> in the logo SVG; check the export.");
  }
  return svg.replace(match[0], "");
}

async function main(): Promise<void> {
  const svg = withoutBackground(await fs.readFile(path.join(BRAND, "logo-source.svg"), "utf8"));
  // The artwork embeds large bitmaps, so lift sharp's pixel limit for this trusted local file.
  const master = await sharp(Buffer.from(svg), { limitInputPixels: false })
    .resize(MASTER, MASTER)
    .png()
    .toBuffer();
  const crest = await sharp(master).trim({ threshold: 1 }).png().toBuffer();
  const contain = (input: Buffer, size: number, background = CLEAR) =>
    sharp(input).resize(size, size, { fit: "contain", background }).png({ compressionLevel: 9 }).toBuffer();

  // Crest for the site header/footer (Astro resizes it per use).
  await sharp(crest)
    .resize({ height: 600 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(BRAND, "logo-mark.png"));

  // Share image: crest centred on the brand navy.
  const ogCrest = await sharp(crest).resize({ height: 500 }).toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: NAVY } })
    .composite([{ input: ogCrest, gravity: "centre" }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(path.join(BRAND, "og-image.jpg"));

  // Structured-data logo and app icons.
  await fs.mkdir(PUBLIC, { recursive: true });
  await sharp(crest)
    .resize({ width: 600 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, "logo.png"));
  await fs.writeFile(path.join(PUBLIC, "icon-192.png"), await contain(crest, 192));
  await fs.writeFile(path.join(PUBLIC, "icon-512.png"), await contain(crest, 512));
  // Apple touch icon: opaque navy square with a little breathing room (iOS rounds the corners).
  const touchCrest = await contain(crest, 148);
  await sharp({ create: { width: 180, height: 180, channels: 4, background: NAVY } })
    .composite([{ input: touchCrest, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, "apple-touch-icon.png"));

  // Favicons: the shield and "J" only, cut out along the shield outline.
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER}" height="${MASTER}" viewBox="0 0 1500 1500">` +
      `<path d="${SHIELD_OUTLINE}" fill="#000"/></svg>`,
  );
  const shield = await sharp(master)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer()
    .then((b) => sharp(b).trim({ threshold: 1 }).png().toBuffer());
  const icoImages = await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, data: await contain(shield, size) })),
  );
  await fs.writeFile(path.join(PUBLIC, "favicon.ico"), ico(icoImages));
  await fs.writeFile(path.join(PUBLIC, "favicon-32.png"), await contain(shield, 32));
  await fs.rm(path.join(PUBLIC, "favicon.svg"), { force: true });

  const { width, height } = await sharp(crest).metadata();
  console.log(`crest ${width}x${height}; logo-mark, og-image, logo.png and favicons written`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
