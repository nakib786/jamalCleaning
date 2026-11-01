/**
 * Cloudflare Worker for the static site (Workers static assets).
 *
 * Only `/api/*` reaches this code (`assets.run_worker_first` in wrangler.jsonc); every other
 * request is served straight from `dist/` by the asset handler.
 *
 *   POST /api/quote      home page "Request a Quote" form
 *   POST /api/contact    contact page form
 *   POST /api/subscribe  footer newsletter form
 *
 * Each submission is checked (honeypot, field limits, Cloudflare Turnstile siteverify) and
 * emailed to EMAIL_TO through the Email Service `send_email` binding. Responses are JSON
 * ({ ok, error? }) for the site's fetch() calls; plain form posts (no JavaScript) get a small
 * HTML page, because Turnstile cannot run without JavaScript.
 */

interface Env {
  ASSETS: Fetcher;
  /** Email Service binding (wrangler.jsonc `send_email`). Missing in local dev unless configured. */
  EMAIL?: EmailBinding;
  /** Turnstile secret key (secret: `wrangler secret put TURNSTILE_SECRET_KEY`). */
  TURNSTILE_SECRET_KEY?: string;
  /** Where submissions are sent, e.g. "info@jmcleaningservice.ca" (comma-separate for several). */
  EMAIL_TO?: string;
  /** Sender on a domain onboarded to Email Service, e.g. "website@jmcleaningservice.ca". */
  EMAIL_FROM?: string;
  SITE_NAME?: string;
}

/** Minimal shape of the Email Service binding used here. */
interface EmailBinding {
  send(message: {
    to: string | string[];
    from: { email: string; name?: string };
    replyTo?: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId?: string }>;
}

type FormKind = "quote" | "contact" | "subscribe";

interface FieldRule {
  label: string;
  required?: boolean;
  max: number;
  email?: boolean;
}

const FORMS: Record<FormKind, { subject: string; fields: Record<string, FieldRule> }> = {
  quote: {
    subject: "New quote request",
    fields: {
      name: { label: "Name", required: true, max: 120 },
      email: { label: "Email", required: true, max: 160, email: true },
      phone: { label: "Phone", required: true, max: 40 },
      service: { label: "Service", required: true, max: 120 },
      message: { label: "Message", max: 3000 },
    },
  },
  contact: {
    subject: "New contact message",
    fields: {
      name: { label: "Name", required: true, max: 120 },
      email: { label: "Email", required: true, max: 160, email: true },
      phone: { label: "Phone", max: 40 },
      service: { label: "Service", required: true, max: 120 },
      message: { label: "Message", max: 3000 },
      consent: { label: "Agreed to be contacted", required: true, max: 10 },
    },
  },
  subscribe: {
    subject: "New newsletter subscriber",
    fields: {
      email: { label: "Email", required: true, max: 160, email: true },
    },
  },
};

const MAX_BODY_BYTES = 32 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/api\/(quote|contact|subscribe)\/?$/.exec(url.pathname);

    if (!match) {
      // Unknown API route: let the asset handler answer (it serves the custom 404 page).
      return url.pathname.startsWith("/api/")
        ? json({ ok: false, error: "Not found." }, 404)
        : env.ASSETS.fetch(request);
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, 405, { allow: "POST" });
    }

    const wantsJson = (request.headers.get("content-type") ?? "").includes("application/json");
    try {
      const data = await readBody(request, wantsJson);
      const kind = match[1] as FormKind;
      await handleSubmission(kind, data, request, env);
      return wantsJson ? json({ ok: true }) : htmlPage(env, true);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message =
        error instanceof HttpError
          ? error.message
          : "Sorry, we couldn't send your message. Please call us instead.";
      if (!(error instanceof HttpError)) console.error("form submission failed", error);
      return wantsJson ? json({ ok: false, error: message }, status) : htmlPage(env, false, message);
    }
  },
} satisfies ExportedHandler<Env>;

async function readBody(request: Request, isJson: boolean): Promise<Record<string, string>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new HttpError(413, "That message is too long.");
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, "That message is too long.");

  const entries: [string, unknown][] = isJson
    ? Object.entries((JSON.parse(raw || "{}") as Record<string, unknown>) ?? {})
    : [...new URLSearchParams(raw).entries()];
  const data: Record<string, string> = {};
  for (const [key, value] of entries) if (typeof value === "string") data[key] = value.trim();
  return data;
}

async function handleSubmission(kind: FormKind, data: Record<string, string>, request: Request, env: Env) {
  // Honeypot: real visitors never see or fill the "company" field. Pretend success to bots.
  if (data.company) return;

  const form = FORMS[kind];
  const values: { label: string; value: string }[] = [];
  for (const [name, rule] of Object.entries(form.fields)) {
    const value = data[name] ?? "";
    if (rule.required && !value) throw new HttpError(400, `Please fill in ${rule.label.toLowerCase()}.`);
    if (value.length > rule.max) throw new HttpError(400, `${rule.label} is too long.`);
    if (value && rule.email && !EMAIL_PATTERN.test(value))
      throw new HttpError(400, "Please enter a valid email address.");
    if (value) values.push({ label: rule.label, value });
  }

  await verifyTurnstile(data.turnstileToken ?? "", request, env);

  if (!env.EMAIL || !env.EMAIL_TO || !env.EMAIL_FROM) {
    console.error("Email is not configured: set the send_email binding, EMAIL_TO and EMAIL_FROM.");
    throw new HttpError(503, "Our form is temporarily unavailable. Please call or email us instead.");
  }

  const site = env.SITE_NAME || "Website";
  const page = request.headers.get("referer") ?? "";
  const rows = values.map(
    (v) =>
      `<tr><th align="left" style="padding:4px 12px 4px 0;vertical-align:top">${escapeHtml(v.label)}</th><td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(v.value)}</td></tr>`,
  );
  const text = [...values.map((v) => `${v.label}: ${v.value}`), "", page && `Sent from: ${page}`].join("\n");

  await env.EMAIL.send({
    to: env.EMAIL_TO.split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    from: { email: env.EMAIL_FROM, name: site },
    replyTo: data.email,
    subject: `${form.subject}${data.name ? ` from ${data.name}` : ""} — ${site}`,
    html: `<h2 style="font-family:Arial,sans-serif">${escapeHtml(form.subject)}</h2><table style="font-family:Arial,sans-serif;font-size:15px">${rows.join("")}</table>${page ? `<p style="font-family:Arial,sans-serif;color:#666;font-size:13px">Sent from ${escapeHtml(page)}</p>` : ""}`,
    text,
  });
}

async function verifyTurnstile(token: string, request: Request, env: Env): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error("TURNSTILE_SECRET_KEY is not set.");
    throw new HttpError(503, "Our form is temporarily unavailable. Please call or email us instead.");
  }
  if (!token) throw new HttpError(400, "Please complete the spam check and try again.");

  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.append("remoteip", ip);
  body.append("idempotency_key", crypto.randomUUID());

  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  })
    .then((r) => r.json<{ success: boolean; "error-codes"?: string[] }>())
    .catch(() => ({ success: false, "error-codes": ["siteverify-unreachable"] }));
  if (!result.success) {
    console.warn("turnstile rejected", result["error-codes"]);
    throw new HttpError(403, "The spam check failed. Please refresh the page and try again.");
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/** Fallback page for form posts made without JavaScript. */
function htmlPage(env: Env, ok: boolean, message = ""): Response {
  const site = escapeHtml(env.SITE_NAME || "our website");
  const heading = ok ? "Thank you!" : "Message not sent";
  const text = ok
    ? "We'll get back to you shortly."
    : escapeHtml(message || "Please enable JavaScript and try again, or call us.");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${heading} | ${site}</title><body style="font-family:Arial,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;text-align:center"><h1>${heading}</h1><p>${text}</p><p><a href="/">Back to ${site}</a></p></body></html>`,
    {
      status: ok ? 200 : 400,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
