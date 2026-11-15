/**
 * WebMCP, declarative form API (https://github.com/webmachinelearning/webmcp): attributes that let an
 * AI agent in the visitor's own browser use a form as a named tool. Nothing changes for people, the
 * Turnstile check still runs, and the form only sends when it is submitted. The helpers return
 * objects to spread onto elements, because Astro's attribute types do not know these names yet.
 */
export const webmcpTool = (name: string, description: string) => ({
  toolname: name,
  tooldescription: description,
});

export const webmcpParam = (description: string) => ({ toolparamdescription: description });

/** The hidden spam-trap field: an agent that fills it gets the request dropped as spam. */
export const webmcpHoneypot = webmcpParam("Spam trap. Always leave this empty.");
