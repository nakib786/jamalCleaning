/** Build-time search index for the header search dialog. */
import { getCollection } from "astro:content";
import { site } from "../config/site";

export interface SearchEntry {
  title: string;
  url: string;
  type: string;
  text: string;
}

export async function getSearchIndex(): Promise<SearchEntry[]> {
  const pages: SearchEntry[] = site.nav
    .flatMap((item) => [item, ...(item.children ?? [])])
    .filter((item, i, all) => all.findIndex((other) => other.href === item.href) === i)
    .map((item) => ({ title: item.label, url: item.href, type: "Page", text: "" }));

  const services = (await getCollection("services").catch(() => [])).map((s) => ({
    title: s.data.title,
    url: `/services/${s.id}/`,
    type: "Service",
    text: s.data.excerpt,
  }));
  const projects = (await getCollection("projects").catch(() => [])).map((p) => ({
    title: p.data.title,
    url: `/projects/${p.id}/`,
    type: "Project",
    text: `${p.data.category} ${p.data.excerpt}`,
  }));

  return [...services, ...projects, ...pages.filter((p) => !services.some((s) => s.url === p.url))];
}
