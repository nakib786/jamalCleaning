/**
 * /llms.txt: a plain-text summary of the business and its key pages for AI assistants and answer engines
 * (https://llmstxt.org). It is generated from the site config and the content collections, so it never
 * drifts from the pages. Testimonials and portfolio entries are left out until they are real.
 */
import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { isSet, site, whatsappLink } from "../config/site";

export const GET: APIRoute = async () => {
  const url = (path: string) => new URL(path, site.url).href;
  const { contact } = site;
  const services = (await getCollection("services")).sort((a, b) => a.data.order - b.data.order);
  const faqs = (await getCollection("faqs")).sort((a, b) => a.data.order - b.data.order);
  const seen = new Set<string>();
  const uniqueFaqs = faqs.filter((f) => !seen.has(f.data.question) && seen.add(f.data.question));

  const lines = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    "## Business details",
    "",
    `- Location: ${contact.address.locality}, ${contact.address.region}, ${contact.address.country === "CA" ? "Canada" : contact.address.country}`,
    ...(isSet(contact.address.street) ? [`- Address: ${contact.address.street}`] : []),
    `- Cleaning hours: ${contact.hours.short}`,
    `- Office hours: ${contact.hours.office}`,
    `- WhatsApp (preferred contact): ${contact.whatsapp.display}, ${whatsappLink("")}`,
    `- Phone: ${contact.phone.display}`,
    `- Email: ${contact.email}`,
    `- Request a quote: ${url(site.quote.href)}`,
    "",
    "## Services",
    "",
    ...services.map(
      (s) => `- [${s.data.title}](${url(`/services/${s.id}/`)}): ${s.data.quickAnswer ?? s.data.excerpt}`,
    ),
    "",
    "## Key pages",
    "",
    `- [About us](${url("/about-us/")}): who we are and how we work`,
    `- [Showcase](${url("/showcase/")}): photos of recent retail and residential cleaning jobs, grouped by project`,
    `- [FAQs](${url("/faqs/")}): answers about booking, products and what to expect`,
    `- [Contact](${url("/contact-us/")}): WhatsApp, phone, email, address and quote request form`,
    `- [Service terms](${url("/service-terms/")}): quotes, scheduling, access, payment, re-cleans and damage claims`,
    `- [Privacy policy](${url("/privacy-policy/")}): what personal information we collect and how we use it`,
    "",
    "## Frequently asked questions",
    "",
    ...uniqueFaqs.flatMap((f) => [`**${f.data.question}** ${f.data.answer}`, ""]),
  ];

  return new Response(lines.join("\n").trimEnd() + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
