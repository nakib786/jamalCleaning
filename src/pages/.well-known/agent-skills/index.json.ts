/**
 * Agent Skills Discovery index (https://github.com/cloudflare/agent-skills-discovery-rfc, v0.2.0):
 * lists the skills AI agents can use with this site. The digest is the SHA-256 of the exact
 * SKILL.md text, so it updates whenever the skill does.
 */
import type { APIRoute } from "astro";
import { quoteSkill, quoteSkillMarkdown, sha256 } from "../../../lib/agent-skill";

export const GET: APIRoute = async () => {
  const index = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: quoteSkill.name,
        type: "skill-md",
        description: quoteSkill.description,
        url: quoteSkill.path,
        digest: `sha256:${sha256(await quoteSkillMarkdown())}`,
      },
    ],
  };
  return new Response(JSON.stringify(index, null, 2) + "\n", {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
