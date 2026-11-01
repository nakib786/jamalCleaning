/** Minimal declarations for the parts of fontkit used by tools/assets/extract-icons.ts (it ships no types). */
declare module "fontkit" {
  interface Path {
    scale(x: number, y?: number): Path;
    translate(x: number, y: number): Path;
    toSVG(): string;
  }
  interface Glyph {
    id: number;
    advanceWidth: number;
    path: Path;
  }
  export interface Font {
    unitsPerEm: number;
    ascent: number;
    glyphForCodePoint(codePoint: number): Glyph | null;
  }
  export function create(buffer: Uint8Array): Font;
}
