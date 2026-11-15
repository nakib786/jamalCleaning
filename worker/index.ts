/**
 * Cloudflare Worker for the static site (Workers static assets).
 *
 * Every request except the fingerprinted build files (`/_astro/*`) reaches this code
 * (`assets.run_worker_first` in wrangler.jsonc). Pages and files are passed to the asset handler,
 * which still applies `_redirects`, `_headers`, trailing slashes and the 404 page. On top of that:
 *
 *   Pages for AI agents   a request that prefers `Accept: text/markdown`, or `<page>/index.md`, gets
 *                         the Markdown copy written at build time (src/integrations/agent-markdown.ts)
 *   POST /api/quote      quote form in the home page card
 *   POST /api/contact    the same form on the contact page
 *   POST /api/subscribe  footer newsletter form
 *
 * The quote and contact forms are one component (src/components/forms/QuoteForm.astro) with the same
 * fields; the two endpoints only differ in the email subject and the Wix CRM form they fill.
 *
 * Each submission is checked (spam trap, field limits, Cloudflare Turnstile siteverify), then
 * emailed to EMAIL_TO through the Email Service `send_email` binding AND saved to the Wix CRM
 * (contact + form submission; newsletter and quote requesters are subscribed) when WIX_CLIENT_ID is set.
 * Either destination succeeding counts as sent. Responses are JSON
 * ({ ok, error?, field? }; `field` names the form field an error belongs to, so the page can show
 * it next to that field) for the site's fetch() calls. Plain form posts (no JavaScript) get a small
 * HTML page that explains the form needs JavaScript, because Turnstile cannot run without it.
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
  /**
   * Public client id of the Wix Headless project that stores contacts and form submissions.
   * Leave unset to skip Wix (previews and local tests do, so they never add test contacts).
   */
  WIX_CLIENT_ID?: string;
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
  /** Set when the field is required: the message shown if it is empty. */
  missing?: string;
  max: number;
  email?: boolean;
}

/**
 * Hidden spam-trap field of the quote form. It was called "company" until 2026-11: browser autofill
 * and AI agents fill a field with that name, and real requests were dropped. Keep in sync with
 * QuoteForm.astro.
 */
const HONEYPOT = "hp_field";

/** Quote and contact forms have the same fields (keep in sync with QuoteForm.astro). */
const ENQUIRY_FIELDS: Record<string, FieldRule> = {
  name: { label: "Name", missing: "Please enter your name.", max: 120 },
  email: { label: "Email", missing: "Please enter your email address.", max: 160, email: true },
  phone: { label: "Phone", max: 40 },
  service: { label: "Service", missing: "Please choose a service.", max: 120 },
  message: { label: "Message", max: 3000 },
  consent: {
    label: "Agreed to be contacted",
    missing: "Please tick the box so we can reply to you.",
    max: 10,
  },
};

const FORMS: Record<FormKind, { subject: string; fields: Record<string, FieldRule> }> = {
  quote: { subject: "New quote request", fields: ENQUIRY_FIELDS },
  contact: { subject: "New contact message", fields: ENQUIRY_FIELDS },
  subscribe: {
    subject: "New newsletter subscriber",
    fields: {
      email: { label: "Email", missing: "Please enter your email address.", max: 160, email: true },
    },
  },
};

const MAX_BODY_BYTES = 32 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Name of the form field the message belongs to, when there is one. */
    readonly field?: string,
    /** Stable reason code for the no-JavaScript fallback page. */
    readonly code?: "no-token",
  ) {
    super(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/api\/(quote|contact|subscribe)\/?$/.exec(url.pathname);

    if (!match) {
      return url.pathname.startsWith("/api/")
        ? json({ ok: false, error: "Not found." }, 404)
        : serveSite(request, url, env);
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
      if (wantsJson) {
        const field = error instanceof HttpError ? error.field : undefined;
        return json({ ok: false, error: message, ...(field ? { field } : {}) }, status);
      }
      // A plain form post has no Turnstile token: the visitor's browser is not running JavaScript.
      const noScript = error instanceof HttpError && error.code === "no-token";
      return htmlPage(
        env,
        false,
        noScript
          ? "This form needs JavaScript for its spam check, so your request was not sent. Please turn JavaScript on and try again, or reach us by WhatsApp, phone or email."
          : message,
      );
    }
  },
} satisfies ExportedHandler<Env>;

/** Matches the Content-Signal lines in public/robots.txt. */
const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=yes";

/** Pages and files from dist/, with Markdown copies of pages for AI agents. */
async function serveSite(request: Request, url: URL, env: Env): Promise<Response> {
  const readable = request.method === "GET" || request.method === "HEAD";

  // <page>/index.md: the Markdown copy at its own URL, for agents that cannot send an Accept header.
  if (readable && url.pathname.endsWith("/index.md")) {
    const asset = await env.ASSETS.fetch(request);
    if (!asset.ok && asset.status !== 304) return asset;
    const page = new URL(url.pathname.slice(0, -"index.md".length), url);
    const response = await markdownResponse(asset);
    // The HTML page is the one to index and cite.
    response.headers.set("Link", `<${page.href}>; rel="canonical"`);
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
  }

  // Same URL, Markdown instead of HTML when the client asks for it (content negotiation).
  if (readable && url.pathname.endsWith("/") && prefersMarkdown(request.headers.get("accept"))) {
    const asset = await env.ASSETS.fetch(new Request(new URL(`${url.pathname}index.md`, url), request));
    if (asset.ok || asset.status === 304) return markdownResponse(asset);
  }

  const asset = await env.ASSETS.fetch(request);
  if (asset.status !== 200 || !(asset.headers.get("content-type") ?? "").startsWith("text/html")) {
    return asset;
  }
  // HTML pages: caches must key on Accept now, and agents can find the Markdown copy from the headers.
  const response = new Response(asset.body, asset);
  response.headers.append("Vary", "Accept");
  if (url.pathname.endsWith("/")) {
    response.headers.append("Link", `<${url.pathname}index.md>; rel="alternate"; type="text/markdown"`);
  }
  return response;
}

async function markdownResponse(asset: Response): Promise<Response> {
  // The Markdown copies are small (under ~15 KB), so reading them whole is cheap.
  const text = asset.status === 304 ? null : await asset.text();
  const response = new Response(text, asset);
  response.headers.set("Content-Type", "text/markdown; charset=utf-8");
  response.headers.append("Vary", "Accept");
  response.headers.set("Content-Signal", CONTENT_SIGNAL);
  // Rough token count (about 4 characters per token), so agents can budget their context.
  if (text) response.headers.set("X-Markdown-Tokens", String(Math.ceil(text.length / 4)));
  return response;
}

/**
 * True when the Accept header ranks text/markdown above text/html (on a tie, the one listed first wins).
 * Browsers never list text/markdown, so they always get HTML.
 */
function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  let markdown = { q: 0, at: Infinity };
  let html = { q: 0, at: Infinity };
  accept.split(",").forEach((part, at) => {
    const [type = "", ...params] = part.trim().toLowerCase().split(";");
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(q)) return;
    if (type.trim() === "text/markdown" && q > markdown.q) markdown = { q, at };
    if (type.trim() === "text/html" && q > html.q) html = { q, at };
  });
  return markdown.q > 0 && (markdown.q > html.q || (markdown.q === html.q && markdown.at < html.at));
}

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
  // Spam trap: a hidden field that people never see. It used to be dropped silently, which also threw
  // away real requests when autofill or an AI agent filled it; now the sender is told, so a genuine
  // one can clear it and try again. Turnstile below is the real spam check.
  if (data[HONEYPOT]) {
    throw new HttpError(
      400,
      "Your request was not sent: a hidden field that must stay empty was filled in. Please clear it and try again, or call or email us.",
      HONEYPOT,
    );
  }

  const form = FORMS[kind];
  const values: { label: string; value: string }[] = [];
  for (const [name, rule] of Object.entries(form.fields)) {
    const value = data[name] ?? "";
    if (rule.missing && !value) throw new HttpError(400, rule.missing, name);
    if (value.length > rule.max) throw new HttpError(400, `${rule.label} is too long.`, name);
    if (value && rule.email && !EMAIL_PATTERN.test(value))
      throw new HttpError(400, "Please enter a valid email address.", name);
    if (value) values.push({ label: rule.label, value });
  }

  await verifyTurnstile(data.turnstileToken ?? "", request, env);

  // Two destinations: the notification email and the Wix CRM (contacts + form submissions). The
  // customer is told "sent" if at least one of them worked, so a lead is not lost when one is down.
  const { EMAIL, EMAIL_TO, EMAIL_FROM, WIX_CLIENT_ID } = env;
  if (!EMAIL || !EMAIL_TO || !EMAIL_FROM) {
    console.error("Email is not configured: set the send_email binding, EMAIL_TO and EMAIL_FROM.");
  }
  if ((!EMAIL || !EMAIL_TO || !EMAIL_FROM) && !WIX_CLIENT_ID) {
    throw new HttpError(503, "Our form is temporarily unavailable. Please call or email us instead.");
  }

  const jobs: Promise<unknown>[] = [];
  if (EMAIL && EMAIL_TO && EMAIL_FROM) {
    jobs.push(sendNotificationEmail(EMAIL, EMAIL_TO, EMAIL_FROM, form, values, data, request, env));
  }
  if (WIX_CLIENT_ID) jobs.push(saveToWix(kind, data, WIX_CLIENT_ID));
  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  for (const r of failed) console.error("form delivery failed", r.reason);
  if (failed.length === jobs.length) throw failed[0].reason;
}

async function sendNotificationEmail(
  emailBinding: EmailBinding,
  emailTo: string,
  emailFrom: string,
  form: { subject: string },
  values: { label: string; value: string }[],
  data: Record<string, string>,
  request: Request,
  env: Env,
): Promise<void> {
  const site = env.SITE_NAME || "Website";
  const page = request.headers.get("referer") ?? "";
  const credit = "Website by Aurora N&N Business Solution Inc. — https://aurorabusiness.ca";
  const text = [
    form.subject,
    "",
    ...values.map((v) => `${v.label}: ${v.value}`),
    "",
    page && `Sent from: ${page}`,
    data.email && "Reply to this email to answer the customer directly.",
    "",
    "--",
    credit,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
  const html = emailHtml(site, form.subject, values, page, data.email);

  await emailBinding.send({
    to: emailTo
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    from: { email: emailFrom, name: site },
    replyTo: data.email,
    subject: `${form.subject}${data.name ? ` from ${data.name}` : ""} — ${site}`,
    html,
    text,
  });
}

/**
 * Wix CRM (a Wix Headless project used only as a back office). Each website form has a matching
 * Wix form; a submission creates or updates the Wix contact. Newsletter signups and quote requests
 * also mark the contact's email as SUBSCRIBED (quote requesters under Canada's CASL implied consent
 * for an inquiry, which lasts 6 months; Wix adds an unsubscribe link to every campaign).
 * `targets` maps our field names to the Wix form's field keys.
 * Dashboard: https://manage.wix.com/dashboard/8f5da4c3-3c27-477e-9c65-15ddd1c6ff10
 */
const WIX_FORMS: Record<FormKind, { formId: string; targets: Record<string, string> }> = {
  quote: {
    formId: "b138a7a0-3716-4ea9-8924-dcfdc98438c3",
    targets: {
      firstName: "first_name_eb6a",
      lastName: "last_name_0c14",
      email: "email_d573",
      phone: "phone_e23d",
      service: "service_fc0a",
      message: "message_be68",
      subscribe: "subscribe_9c31",
    },
  },
  contact: {
    formId: "494fe9b5-8097-4c72-b824-cf805761eaaa",
    targets: {
      firstName: "first_name_3052",
      lastName: "last_name_520d",
      email: "email_748c",
      phone: "phone_62ce",
      service: "service_26ec",
      message: "message_cf2e",
      consent: "consent_d390",
    },
  },
  subscribe: {
    formId: "4faa49e0-736b-49ad-ab6f-5bc822a91871",
    targets: { email: "email_aef4", subscribe: "subscribe_2c85" },
  },
};

const WIX_TIMEOUT_MS = 8000;

/**
 * Anonymous visitor token for the Wix Headless client (the client id is public, not a secret).
 * A fresh one per submission, so each customer is their own Wix visitor (a shared token would make
 * every lead look like one visitor to Wix's spam filter).
 */
async function getWixToken(clientId: string): Promise<string> {
  const res = await fetch("https://www.wixapis.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId, grantType: "anonymous" }),
    signal: AbortSignal.timeout(WIX_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Wix token request failed (${res.status})`);
  const body = await res.json<{ access_token: string }>();
  return body.access_token;
}

/** Wix accepts phone numbers only in international form (+12505550100); null when it can't be made. */
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

async function saveToWix(kind: FormKind, data: Record<string, string>, clientId: string): Promise<void> {
  const { formId, targets } = WIX_FORMS[kind];
  const submission: Record<string, string | boolean> = {};
  const put = (field: string, value: string | boolean | undefined) => {
    if (value === undefined || value === "") return;
    const target = targets[field];
    if (target) submission[target] = value;
  };

  put("email", data.email);
  if (kind === "subscribe") {
    put("subscribe", true);
  } else {
    // The website has one "Name" box; Wix keeps first and last name separately.
    const [firstName, ...rest] = (data.name ?? "").split(/\s+/).filter(Boolean);
    put("firstName", firstName);
    put("lastName", rest.join(" "));
    put("service", data.service);
    let message = data.message ?? "";
    if (data.phone) {
      const phone = toE164(data.phone);
      if (phone) put("phone", phone);
      else message = `${message}${message ? "\n\n" : ""}Phone (as typed): ${data.phone}`;
    }
    put("message", message);
    if (kind === "contact") put("consent", Boolean(data.consent));
    if (kind === "quote") put("subscribe", true);
  }

  const res = await fetch("https://www.wixapis.com/form-submission-service/v4/submissions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: await getWixToken(clientId) },
    body: JSON.stringify({ submission: { formId, submissions: submission } }),
    signal: AbortSignal.timeout(WIX_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Wix submission failed (${res.status}) for ${kind}: ${detail}`);
  }
}

/** Branded notification email (inline styles and tables for email-client compatibility). */
function emailHtml(
  site: string,
  title: string,
  values: { label: string; value: string }[],
  page: string,
  replyTo: string | undefined,
): string {
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const rows = values
    .map(
      (v, i) =>
        `<tr style="background:${i % 2 ? "#ffffff" : "#f6f8f7"}"><td style="${font}padding:12px 16px;width:34%;vertical-align:top;color:#5c5e5e;font-size:14px;font-weight:bold;border-bottom:1px solid #e7e9f1">${escapeHtml(v.label)}</td><td style="${font}padding:12px 16px;vertical-align:top;color:#212e3b;font-size:15px;line-height:1.5;white-space:pre-wrap;border-bottom:1px solid #e7e9f1">${escapeHtml(v.value)}</td></tr>`,
    )
    .join("");
  const time = new Date().toLocaleString("en-CA", {
    timeZone: "Etc/GMT+7",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef1f0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="${font}background:#044340;padding:22px 28px;color:#ffffff">
<div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#96fe81">${escapeHtml(site)}</div>
<div style="font-size:22px;font-weight:bold;margin-top:6px">${escapeHtml(title)}</div>
<div style="font-size:13px;color:#cfe3dd;margin-top:6px">Received ${escapeHtml(time)} (Pacific Time, UTC−7)</div>
</td></tr>
<tr><td style="padding:20px 28px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e9f1;border-radius:8px;overflow:hidden">${rows}</table></td></tr>
<tr><td style="${font}padding:12px 28px 24px;color:#5c5e5e;font-size:13px;line-height:1.5">
${replyTo ? `<a href="mailto:${escapeHtml(replyTo)}" style="display:inline-block;background:#00a650;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:100px;font-size:14px">Reply to ${escapeHtml(replyTo)}</a><br><br>` : ""}
${page ? `Sent from <a href="${escapeHtml(page)}" style="color:#00a650">${escapeHtml(page)}</a>` : ""}
</td></tr>
<tr><td style="${font}background:#f6f8f7;border-top:1px solid #e7e9f1;padding:14px 28px;color:#9fa2a4;font-size:12px;text-align:center">
This message was sent automatically by the ${escapeHtml(site)} website contact form.<br>
Website designed &amp; developed by <a href="https://aurorabusiness.ca" style="color:#044340;font-weight:bold;text-decoration:none">Aurora N&amp;N Business Solution Inc.</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

async function verifyTurnstile(token: string, request: Request, env: Env): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error("TURNSTILE_SECRET_KEY is not set.");
    throw new HttpError(503, "Our form is temporarily unavailable. Please call or email us instead.");
  }
  if (!token)
    throw new HttpError(400, "Please complete the spam check and try again.", undefined, "no-token");

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
    : escapeHtml(message || "Please turn JavaScript on and try again, or call us.");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${heading} | ${site}</title><body style="font-family:Arial,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;text-align:center"><h1>${heading}</h1><p>${text}</p><p><a href="/contact-us/">Contact details</a> · <a href="/">Back to ${site}</a></p></body></html>`,
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
