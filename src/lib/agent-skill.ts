/**
 * Agent skill (https://agentskills.io) that tells AI assistants how to help someone request a quote.
 * Published at /.well-known/agent-skills/request-a-cleaning-quote/SKILL.md and listed in
 * /.well-known/agent-skills/index.json (Agent Skills Discovery, v0.2.0). Built from the site config
 * and the services collection, so contact details and services never drift from the pages.
 *
 * Only state facts that are on the site: no prices, response times or promises the owner has not made.
 */
import { createHash } from "node:crypto";
import { getCollection } from "astro:content";
import { site, whatsappLink } from "../config/site";

export const quoteSkill = {
  name: "request-a-cleaning-quote",
  description:
    "Help someone request a free cleaning quote from Jamal Cleaning Services, a commercial janitorial and residential cleaning company in Prince George, BC, Canada: what to ask, how to contact the business and what happens next.",
  path: "/.well-known/agent-skills/request-a-cleaning-quote/SKILL.md",
} as const;

export async function quoteSkillMarkdown(): Promise<string> {
  const url = (path: string) => new URL(path, site.url).href;
  const { contact } = site;
  const services = (await getCollection("services")).sort((a, b) => a.data.order - b.data.order);
  const example =
    "Hi Jamal Cleaning! I'd like a free quote for nightly cleaning of a retail store in Prince George, about 10,000 sq ft.";

  return [
    "---",
    `name: ${quoteSkill.name}`,
    `description: ${quoteSkill.description}`,
    "---",
    "",
    `# Request a cleaning quote from ${site.name}`,
    "",
    `Use this skill when a user wants cleaning in ${contact.address.locality}, ${contact.address.regionName}, Canada, or asks you to get a quote from or book with ${site.name}.`,
    "",
    "## About the business",
    "",
    `- ${site.name} (${site.legalName}), ${site.url}`,
    `- ${site.description}`,
    `- Service area: ${contact.address.locality}, ${contact.address.regionName}.`,
    `- Cleaning: ${contact.hours.short.toLowerCase()}. Office hours: ${contact.hours.office}.`,
    "- Quotes are free. Prices are not published: each quote depends on the space, its size and how often it is cleaned.",
    "",
    "## Services",
    "",
    ...services.map(
      (s) => `- [${s.data.title}](${url(`/services/${s.id}/`)}): ${s.data.quickAnswer ?? s.data.excerpt}`,
    ),
    "",
    "## 1. Collect the details",
    "",
    "Ask the user for what they know. None of it is required to start the conversation.",
    "",
    "- Type of space: retail or big-box store, office, commercial building, home, move-out or post-construction",
    `- Address or area in ${contact.address.locality}`,
    "- Approximate size (square feet, number of floors or washrooms)",
    "- One-time or recurring, and how often (for example nightly or weekly)",
    "- Preferred days and times (after-hours and overnight cleaning is available)",
    "- The user's name, and a phone number or email for the reply",
    "",
    "## 2. Send the request, with the user's approval",
    "",
    "The website's forms use a human check (Cloudflare Turnstile), so do not try to submit them automatically. Draft the message, show it to the user, and let them send it in one of these ways:",
    "",
    `1. WhatsApp (the business's preferred channel): ${whatsappLink("")}?text= followed by the URL-encoded message. Example: ${whatsappLink(example)}`,
    `2. Phone or text: ${contact.phone.display} (${contact.phone.e164})`,
    `3. Email: ${contact.email}`,
    `4. Quote form: ${url(site.quote.href)}`,
    "",
    "Do not send a message on the user's behalf unless they ask you to.",
    "",
    "## 3. What happens next",
    "",
    `${site.name} replies to arrange the details and send a free quote. The general terms for cleaning work are at ${url("/service-terms/")}.`,
    "",
    "## More information",
    "",
    `- Site summary for AI assistants: ${url("/llms.txt")}`,
    `- Frequently asked questions: ${url("/faqs/")}`,
    `- Contact page: ${url("/contact-us/")}`,
    "- Every page is also available as Markdown: send `Accept: text/markdown`, or add `index.md` to the page URL.",
    "",
  ].join("\n");
}

/** Hex SHA-256 of the UTF-8 text, for the `digest` field of the skills index. */
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
