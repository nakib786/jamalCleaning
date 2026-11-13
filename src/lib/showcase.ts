/**
 * Showcase: real photos of the crew's work, grouped into projects (page: /showcase/).
 *
 * To add a project: put its photos in `src/assets/images/showcase/<folder>/` (about 1600px on the long
 * edge, JPEG) and add an entry below. Photos show in the order listed; the first one is the cover.
 * Store names, signs and faces are not used in titles or alt text (client privacy).
 */
import type { ImageMetadata } from "astro";

const photos = import.meta.glob<{ default: ImageMetadata }>("../assets/images/showcase/**/*.jpg", {
  eager: true,
});

export interface ShowcasePhoto {
  src: ImageMetadata;
  alt: string;
}

export interface ShowcaseProject {
  slug: string;
  title: string;
  /** Filter chip on the page. */
  category: "Retail" | "Residential";
  /** One or two plain sentences about the job. */
  description: string;
  /** What was done, shown as a short list. */
  scope: string[];
  photos: ShowcasePhoto[];
}

function photo(folder: string, file: string, alt: string): ShowcasePhoto {
  const key = `../assets/images/showcase/${folder}/${file}.jpg`;
  const mod = photos[key];
  if (!mod) throw new Error(`Showcase photo not found: ${key}`);
  return { src: mod.default, alt };
}

export const showcaseProjects: ShowcaseProject[] = [
  {
    slug: "big-box-store-floors",
    title: "Big-Box Store Aisles & Floors",
    category: "Retail",
    description:
      "Floor care for large retail stores, so the sales floor is clean, bright and safe to walk when the doors open.",
    scope: [
      "Dust mopping and wet cleaning of the main aisles",
      "A clean, glossy finish on vinyl tile",
      "Cleaning around racks, displays and fixtures",
      "Care of laminate and wood-look flooring",
    ],
    photos: [
      photo(
        "big-box-aisles",
        "aisle-apparel-home-floor",
        "Freshly cleaned shiny vinyl floor in a wide store aisle between clothing racks",
      ),
      photo(
        "big-box-aisles",
        "aisle-childrens-department",
        "Clean polished store aisle running past children's clothing and costume racks",
      ),
      photo(
        "big-box-aisles",
        "aisle-costumes-and-outerwear",
        "Spotless tile floor with a centre line between racks of jackets and costumes",
      ),
      photo(
        "big-box-aisles",
        "aisle-side-view",
        "Long clean store aisle with the floor reflecting the lights",
      ),
      photo(
        "big-box-aisles",
        "office-supply-store-floor",
        "Glossy cleaned wood-look floor between desks and displays in a store",
      ),
      photo(
        "big-box-aisles",
        "mirrored-column-denim",
        "Clean sales floor and mirrored column beside a rack of jeans",
      ),
    ],
  },
  {
    slug: "fitting-room-cleaning",
    title: "Fitting Room Cleaning",
    category: "Retail",
    description:
      "Fitting rooms get heavy daily use. The crew mops the floors and wipes the mirrors and benches so every stall is ready for customers.",
    scope: [
      "Wet mopping of tile and plank flooring",
      "Mirrors, benches and partitions wiped down",
      "Corridor and stall floors left streak-free",
    ],
    photos: [
      photo(
        "fitting-rooms",
        "fitting-room-mopping",
        "Crew member mopping the floor of a store fitting room, seen in the mirror",
      ),
      photo(
        "fitting-rooms",
        "fitting-room-corridor-floor",
        "Freshly mopped dark plank floor in a fitting room corridor with a large mirror",
      ),
      photo(
        "fitting-rooms",
        "fitting-room-bench-and-mirror",
        "Clean bench and mirror in a fitting room with a freshly mopped floor",
      ),
    ],
  },
  {
    slug: "storefront-window-and-door-cleaning",
    title: "Storefront Window & Door Cleaning",
    category: "Retail",
    description:
      "Clean glass is the first thing customers see. Storefront windows, sliding doors and frames, cleaned so the store looks bright from the street.",
    scope: [
      "Large storefront windows and sliding doors washed and squeegeed",
      "Frames and sills wiped clean",
    ],
    photos: [
      photo(
        "storefront-windows",
        "storefront-entrance-night",
        "Clean storefront windows lit up at night beside the entrance sidewalk",
      ),
      photo(
        "storefront-windows",
        "sliding-doors-and-sidewalk",
        "Clear sliding glass doors and windows with clean frames at a store entrance",
      ),
      photo(
        "storefront-windows",
        "window-merchandise-view",
        "Spotless storefront window looking in on the sales floor",
      ),
      photo(
        "storefront-windows",
        "entrance-window-and-doors",
        "Clean entrance window and automatic doors with the store visible through the glass",
      ),
      photo(
        "storefront-windows",
        "window-and-checkout-view",
        "Smudge-free window with a clear view of the checkout area and clean floor",
      ),
    ],
  },
  {
    slug: "entrance-glass-and-vestibule",
    title: "Entrance Glass & Vestibule",
    category: "Retail",
    description:
      "Inside the front entrance: door glass, window panels, frames and ledges cleaned, and the entrance floor left shining.",
    scope: [
      "Door and window glass cleaned from the inside",
      "Frames and ledges wiped free of dust and fingerprints",
      "Entrance tile floor mopped",
    ],
    photos: [
      photo(
        "entrance-glass",
        "door-glass-and-frames",
        "Clean glass doors and dark frames at a store entrance with a polished floor",
      ),
      photo(
        "entrance-glass",
        "window-glass-and-ledge",
        "Clear window glass and a dust-free ledge looking onto shopping carts",
      ),
      photo(
        "entrance-glass",
        "window-glass-and-reflection",
        "Clean entrance window with a clear reflection of the store",
      ),
      photo(
        "entrance-glass",
        "entrance-doors-and-floor",
        "Row of entrance doors with clean glass beside a shiny tile floor",
      ),
      photo(
        "entrance-glass",
        "window-frame-and-floor",
        "Clean window panels and frame above a freshly cleaned tile floor",
      ),
      photo(
        "entrance-glass",
        "partition-window-checkout",
        "Glass partition and railing at the checkout area, wiped clean",
      ),
    ],
  },
  {
    slug: "retail-washroom-sanitizing",
    title: "Retail Washroom Sanitizing",
    category: "Retail",
    description:
      "Customers remember a clean washroom. Each visit covers the fixtures, mirrors, dispensers and floors.",
    scope: [
      "Toilets, urinals and sinks scrubbed and disinfected",
      "Mirrors, dispensers and partitions wiped",
      "Tile floors mopped",
      "Paper and soap dispensers refilled",
    ],
    photos: [
      photo(
        "retail-washrooms",
        "accessible-stall",
        "Clean accessible washroom stall with grab bars, tiled walls and a paper towel dispenser",
      ),
      photo(
        "retail-washrooms",
        "toilet-stall-tiled",
        "Clean toilet stall with a full paper dispenser and a mopped tile floor",
      ),
      photo(
        "retail-washrooms",
        "sink-and-mirror-wide",
        "Washroom with a clean sink, mirror, soap dispenser and tile floor",
      ),
      photo(
        "retail-washrooms",
        "sink-and-mirror",
        "Washroom sink and mirror wiped clean, with a tidy tiled wall and floor",
      ),
      photo("retail-washrooms", "urinal", "Clean urinal with a fresh screen and deodoriser on a tiled wall"),
    ],
  },
  {
    slug: "townhouse-kitchen-deep-clean",
    title: "Townhouse Kitchen Deep Clean",
    category: "Residential",
    description:
      "A detailed kitchen clean in a townhouse: cabinets, counters and sink, plus the inside of the oven and fridge.",
    scope: [
      "Cabinet fronts, counters and sink cleaned and polished",
      "Oven interior and door glass cleaned",
      "Fridge shelves, drawers and door bins wiped",
      "Stainless appliances polished, floors mopped",
    ],
    photos: [
      photo(
        "townhouse-kitchen",
        "kitchen-cabinets-and-appliances",
        "Clean white kitchen with shiny stainless steel appliances and grey countertops",
      ),
      photo(
        "townhouse-kitchen",
        "kitchen-island-and-sink",
        "Kitchen island, sink and cabinets wiped clean with a polished counter",
      ),
      photo(
        "townhouse-kitchen",
        "fridge-interior",
        "Spotless empty fridge with clean glass shelves and drawers",
      ),
      photo("townhouse-kitchen", "oven-interior", "Clean oven interior and door with the glass wiped clear"),
    ],
  },
  {
    slug: "townhouse-bathrooms-and-floors",
    title: "Townhouse Bathrooms & Floors",
    category: "Residential",
    description:
      "In the same home: bathrooms scrubbed top to bottom and plank flooring mopped through the living area.",
    scope: [
      "Tubs, toilets, vanities and mirrors scrubbed and polished",
      "Sinks, taps and fixtures wiped and shined",
      "Plank flooring vacuumed and mopped through the living areas",
    ],
    photos: [
      photo(
        "townhouse-bathrooms-floors",
        "double-vanity-bathroom",
        "Clean double-vanity bathroom with gleaming sinks, mirrors and a mopped floor",
      ),
      photo("townhouse-bathrooms-floors", "tub-and-toilet", "Clean bathtub and toilet with a tidy floor"),
      photo(
        "townhouse-bathrooms-floors",
        "living-area-floor",
        "Open living area with a freshly mopped glossy wood-look floor",
      ),
    ],
  },
  {
    slug: "basement-suite-new-build-clean",
    title: "Basement Suite Final Clean",
    category: "Residential",
    description: "A final clean of a newly finished basement suite, so it is ready to move into.",
    scope: [
      "Construction dust wiped from cabinets, sills and surfaces",
      "New appliances cleaned inside and out",
      "Bathroom fixtures and tile cleaned",
      "Vinyl plank flooring cleaned and shined",
    ],
    photos: [
      photo(
        "basement-suite",
        "suite-kitchen-and-floor",
        "Bright open basement suite with a clean kitchen and a shiny cleaned plank floor",
      ),
      photo(
        "basement-suite",
        "bathroom-tub-and-toilet",
        "Clean new bathroom with a white tub, toilet and glossy tile floor",
      ),
      photo("basement-suite", "fridge-exterior", "Stainless steel fridge polished and free of fingerprints"),
      photo(
        "basement-suite",
        "fridge-interior",
        "Clean empty fridge interior with fresh shelves and crisper drawers",
      ),
      photo(
        "basement-suite",
        "oven-interior",
        "Clean oven with racks in place and the glass door wiped clear",
      ),
    ],
  },
];

export const showcaseCategories = [...new Set(showcaseProjects.map((p) => p.category))];
