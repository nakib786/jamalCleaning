/** Helpers shared by the project pages. */

/** URL-safe category key, used by the /projects/ filter and its #hash. */
export function categorySlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
