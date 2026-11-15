/** The quote-request agent skill (see src/lib/agent-skill.ts). */
import type { APIRoute } from "astro";
import { quoteSkillMarkdown } from "../../../../lib/agent-skill";

export const GET: APIRoute = async () =>
  new Response(await quoteSkillMarkdown(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
