/**
 * Generates brand assets from the source logo (src/assets/brand/logo.png): a house
 * emblem above a dark-navy "JAMAL / CLEANING SERVICES" wordmark.
 *
 * Outputs:
 *   src/assets/brand/logo-mark.png     emblem only (header/footer lockup, favicons)
 *   src/assets/brand/logo-full.png     full logo, trimmed (light backgrounds)
 *   src/assets/brand/logo-on-dark.png  full logo with the wordmark turned white
 *   src/assets/brand/og-image.jpg      1200×630 social share image
 *   public/logo.png                    600px full logo for structured data
 *   public/favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png
 *
 * Re-run after replacing the logo: `npx tsx tools/assets/brand.ts`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "../lib/site.ts";

const BRAND = path.join(ROOT, "src/assets/brand");
const PUBLIC = path.join(ROOT, "public");
const TEAL = { r: 4, g: 67, b: 64 };
const SOLID = 128;

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

async function main(): Promise<void> {
  const source = path.join(BRAND, "logo.png");
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3] ?? 0;
  const solidInRow = (y: number) => {
    let n = 0;
    for (let x = 0; x < info.width; x++) if (alpha(x, y) >= SOLID) n++;
    return n;
  };
  const bounds = (y0: number, y1: number, pad: number) => {
    let top = y1;
    let bottom = y0;
    let left = info.width;
    let right = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < info.width; x++) {
        if (alpha(x, y) >= SOLID) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    const l = Math.max(0, left - pad);
    const t = Math.max(0, top - pad);
    return {
      left: l,
      top: t,
      width: Math.min(info.width, right + pad) - l,
      height: Math.min(info.height, bottom + pad) - t,
    };
  };

  // The emblem and the wordmark are separated by the emptiest row in the middle band.
  let split = Math.round(info.height * 0.5);
  let fewest = Number.POSITIVE_INFINITY;
  for (let y = Math.round(info.height * 0.45); y < Math.round(info.height * 0.7); y++) {
    const n = solidInRow(y);
    if (n < fewest) {
      fewest = n;
      split = y;
    }
  }

  const full = bounds(0, info.height, 12);
  const emblem = bounds(0, split, 8);
  const markBuffer = await sharp(source).extract(emblem).png({ compressionLevel: 9 }).toBuffer();
  await fs.writeFile(path.join(BRAND, "logo-mark.png"), markBuffer);
  await sharp(source).extract(full).png({ compressionLevel: 9 }).toFile(path.join(BRAND, "logo-full.png"));

  // On-dark variant: below the split, the wordmark is dark navy/grey; turn every dark
  // pixel white except the green leaf accent.
  const recoloured = Buffer.from(data);
  for (let y = split; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const r = recoloured[i] ?? 0;
      const g = recoloured[i + 1] ?? 0;
      const b = recoloured[i + 2] ?? 0;
      const green = g > r + 12 && g > b + 12;
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (luminance < 0.45 && !green) {
        recoloured[i] = 255;
        recoloured[i + 1] = 255;
        recoloured[i + 2] = 255;
      }
    }
  }
  const onDark = await sharp(recoloured, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(full)
    .png({ compressionLevel: 9 })
    .toBuffer();
  await fs.writeFile(path.join(BRAND, "logo-on-dark.png"), onDark);

  // Share image: on-dark logo centred on the brand teal.
  const ogLogo = await sharp(onDark).resize({ width: 980, height: 540, fit: "inside" }).toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: TEAL } })
    .composite([{ input: ogLogo, gravity: "centre" }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(path.join(BRAND, "og-image.jpg"));

  // Structured-data logo and favicons.
  await fs.mkdir(PUBLIC, { recursive: true });
  await sharp(source)
    .extract(full)
    .resize({ width: 600 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, "logo.png"));
  const square = async (size: number, background = { r: 255, g: 255, b: 255, alpha: 0 }) =>
    sharp(markBuffer)
      .resize(size, size, { fit: "contain", background })
      .png({ compressionLevel: 9 })
      .toBuffer();
  const icoImages = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await square(size) })));
  await fs.writeFile(path.join(PUBLIC, "favicon.ico"), ico(icoImages));
  await fs.writeFile(path.join(PUBLIC, "favicon-32.png"), await square(32));
  await fs.writeFile(path.join(PUBLIC, "icon-192.png"), await square(192));
  await fs.writeFile(path.join(PUBLIC, "icon-512.png"), await square(512));
  await fs.writeFile(path.join(PUBLIC, "apple-touch-icon.png"), await square(180, { ...TEAL, alpha: 1 }));
  await fs.rm(path.join(PUBLIC, "favicon.svg"), { force: true });

  console.log(
    `split at y=${split}; emblem ${emblem.width}x${emblem.height}; full ${full.width}x${full.height}; og-image, logo.png and favicons written`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
