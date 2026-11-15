/**
 * Quote form check, the way an AI agent or a screen-reader user meets the page: fields are found
 * only by label and role (getByLabel / getByRole), never by CSS selector.
 *
 * On the home page and the contact page it checks that:
 *   - an empty submit puts a message next to each required field and sends nothing
 *   - the form can be filled in and sent, and the success message appears as text in a status region
 *   - an error from the Worker that names a field is shown next to that field
 *   - the hidden spam-trap field cannot be reached with the keyboard and is not in the accessibility tree
 * Then, once, with JavaScript switched off: the form posts to the real local Worker and the visitor
 * gets the page explaining that the form needs JavaScript (nothing is sent: there is no spam-check token).
 * Last, every JSON-LD block in dist/ is parsed and its types checked against the schema.org types
 * the site is allowed to use.
 *
 * The form endpoint and Turnstile are stubbed in the browser, so no email is sent and no CRM contact
 * is created. Serve the production build first: `npm run preview` (wrangler dev on :8787).
 * Set CHROME_PATH to use an existing Chrome/Chromium instead of Playwright's download.
 *
 * Usage: tsx tools/verify/forms.ts [--base=http://127.0.0.1:8787]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { ROOT } from "../lib/site.ts";

const base = (
  process.argv.find((a) => a.startsWith("--base="))?.slice("--base=".length) ?? "http://127.0.0.1:8787"
).replace(/\/$/, "");

const PAGES = [
  { route: "/", endpoint: "/api/quote" },
  { route: "/contact-us/", endpoint: "/api/contact" },
];
const SPAM_TRAP = "hp_field";
const SUCCESS = /Thank you! Your request has been sent/;

/** schema.org types this site uses. A type outside the list is a typo or an unreviewed addition. */
const SCHEMA_TYPES = new Set([
  "LocalBusiness",
  "ContactPoint",
  "PostalAddress",
  "GeoCoordinates",
  "City",
  "AdministrativeArea",
  "OfferCatalog",
  "Offer",
  "Service",
  "OpeningHoursSpecification",
  "WebSite",
  "WebPage",
  "AboutPage",
  "ContactPage",
  "CollectionPage",
  "FAQPage",
  "Question",
  "Answer",
  "BreadcrumbList",
  "ListItem",
  "ItemList",
  "ImageGallery",
  "ImageObject",
  "CreativeWork",
  "Place",
  "Organization",
]);

const problems: string[] = [];
const fail = (where: string, message: string) => {
  problems.push(`${where}: ${message}`);
  console.log(`  FAIL  ${message}`);
};
const pass = (message: string) => console.log(`  ok    ${message}`);

/** The first form on the page that has the quote button (the newsletter form is skipped). */
function quoteForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Request a free quote" }) })
    .first();
}

async function stubNetwork(
  page: Page,
  endpoint: string,
  sent: Record<string, string>[],
  reply: () => object,
) {
  // Turnstile: a stand-in that hands out a token at once, so the test does not depend on Cloudflare.
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.turnstile={render:()=>'w1',reset(){},getResponse:()=>'test-token'};",
    }),
  );
  // The Worker endpoint: record what would have been sent, send nothing.
  await page.route(`**${endpoint}`, async (route) => {
    sent.push(route.request().postDataJSON() as Record<string, string>);
    const body = reply() as { ok?: boolean };
    await route.fulfill({
      status: body.ok ? 200 : 400,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function checkPage(browser: Browser, route: string, endpoint: string): Promise<void> {
  console.log(`\n${route}  (JavaScript on, ${endpoint} stubbed)`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const sent: Record<string, string>[] = [];
  let reply: () => object = () => ({ ok: true });
  await stubNetwork(page, endpoint, sent, () => reply());
  await page.goto(base + route, { waitUntil: "load" });

  const form = quoteForm(page);
  const button = form.getByRole("button", { name: "Request a free quote" });
  await button.scrollIntoViewIfNeeded();

  // 1. Empty submit: a message next to each required field, focus on the first, nothing sent.
  await button.click();
  for (const text of [
    "Please enter your name.",
    "Please enter your email address.",
    "Please choose a service.",
    "Please tick this box so we can reply to you.",
  ]) {
    if (await form.getByText(text, { exact: true }).isVisible()) pass(`empty submit shows "${text}"`);
    else fail(route, `empty submit did not show "${text}"`);
  }
  const nameField = form.getByLabel("Name", { exact: true });
  if (
    (await nameField.getAttribute("aria-invalid")) === "true" &&
    (await nameField.evaluate((el) => el === document.activeElement))
  )
    pass("first invalid field is marked aria-invalid and focused");
  else fail(route, "first invalid field is not marked and focused");
  if (sent.length === 0) pass("nothing was sent");
  else fail(route, "an empty form was sent");

  // 2. Required / optional are announced on the fields themselves.
  for (const [label, required] of [
    ["Name", true],
    ["Email address", true],
    ["Phone number (optional)", false],
    ["Service", true],
    ["Message (optional)", false],
    [/I agree to be contacted by email or phone about my enquiry/, true],
  ] as const) {
    const control = form.getByLabel(label, { exact: true });
    const isRequired = await control.evaluate((el) => (el as HTMLInputElement).required);
    if (isRequired === required) pass(`"${label}" is ${required ? "required" : "optional"}`);
    else fail(route, `"${label}" should be ${required ? "required" : "optional"}`);
  }

  // 3. Fill in by label and role only, then send.
  await form.getByLabel("Name", { exact: true }).fill("Test Agent");
  await form.getByLabel("Email address", { exact: true }).fill("agent@example.com");
  await form.getByLabel("Phone number (optional)", { exact: true }).fill("(250) 555-0100");
  await form.getByRole("combobox", { name: "Service" }).selectOption({ label: "Other" });
  await form
    .getByLabel("Message (optional)", { exact: true })
    .fill("Office in Prince George, about 5,000 sq ft, weekly evening cleaning.");
  await form.getByRole("checkbox", { name: /I agree to be contacted/ }).check();
  if (
    (await form.getByText("Please enter your name.", { exact: true }).count()) === 0 ||
    !(await form.getByText("Please enter your name.", { exact: true }).isVisible())
  )
    pass("messages clear once the fields are fixed");
  else fail(route, "a field message stayed after the field was fixed");
  await button.click();

  const status = form.getByRole("status");
  try {
    await status.filter({ hasText: SUCCESS }).waitFor({ timeout: 15_000 });
    pass(`success text in the status region: "${(await status.innerText()).trim()}"`);
  } catch {
    fail(route, `no success message (status region says "${(await status.innerText()).trim()}")`);
  }
  const body = sent[0];
  if (
    body &&
    body.name === "Test Agent" &&
    body.email === "agent@example.com" &&
    body.service === "Other" &&
    body.consent === "yes" &&
    body.turnstileToken === "test-token" &&
    !body[SPAM_TRAP]
  )
    pass(`sent to ${endpoint} with name, email, phone, service, message, consent; spam trap empty`);
  else fail(route, `unexpected request body: ${JSON.stringify(body)}`);

  // 4. A Worker error that names a field appears next to that field.
  reply = () => ({ ok: false, error: "Please enter a valid email address.", field: "email" });
  await form.getByLabel("Name", { exact: true }).fill("Test Agent");
  await form.getByLabel("Email address", { exact: true }).fill("agent@example.com");
  await form.getByRole("combobox", { name: "Service" }).selectOption({ index: 1 });
  await form.getByRole("checkbox", { name: /I agree to be contacted/ }).check();
  await button.click();
  const emailField = form.getByLabel("Email address", { exact: true });
  try {
    await form.getByText("Please enter a valid email address.", { exact: true }).waitFor({ timeout: 15_000 });
    const describedBy = (await emailField.getAttribute("aria-describedby")) ?? "";
    const described = await page.evaluate(
      (ids) =>
        ids
          .split(" ")
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" "),
      describedBy,
    );
    if (
      described.includes("valid email address") &&
      (await emailField.getAttribute("aria-invalid")) === "true"
    )
      pass("Worker error is shown next to the email field and tied to it (aria-describedby)");
    else fail(route, "Worker error is not tied to the email field");
  } catch {
    fail(route, "Worker error for the email field was not shown");
  }

  // 5. Spam trap: not reachable by keyboard, not in the accessibility tree.
  await page.reload({ waitUntil: "load" });
  const trap = page.locator(`input[name="${SPAM_TRAP}"]`).first();
  if ((await trap.count()) !== 1) fail(route, "spam-trap field not found (was it renamed?)");
  await quoteForm(page).getByLabel("Name", { exact: true }).focus();
  const focused: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    focused.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLInputElement | null;
        return el?.name || el?.tagName || "";
      }),
    );
  }
  if (!focused.includes(SPAM_TRAP))
    pass(`keyboard order skips the spam trap (${focused.slice(0, 7).join(" > ")})`);
  else fail(route, "the spam trap can be reached with Tab");
  const tree = await quoteForm(page).ariaSnapshot();
  if (!/leave this field empty|company/i.test(tree)) pass("spam trap is not in the accessibility tree");
  else fail(route, "the spam trap appears in the accessibility tree");
  if ((await page.getByRole("textbox", { name: /company/i, includeHidden: true }).count()) === 0)
    pass('no field is labelled "Company"');
  else fail(route, 'a field is still labelled "Company"');

  await context.close();
}

async function checkWithoutJavaScript(browser: Browser): Promise<void> {
  const route = "/contact-us/";
  console.log(`\n${route}  (JavaScript off, real local Worker)`);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(base + route, { waitUntil: "load" });
  const form = quoteForm(page);
  if (await form.getByText(/This form needs JavaScript for its spam check/).isVisible())
    pass("the form itself says it needs JavaScript and gives the phone and email");
  else fail(route, "no note in the form for visitors without JavaScript");
  await form.getByLabel("Name", { exact: true }).fill("Test Agent");
  await form.getByLabel("Email address", { exact: true }).fill("agent@example.com");
  await form.getByRole("combobox", { name: "Service" }).selectOption({ label: "Other" });
  await form.getByRole("checkbox", { name: /I agree to be contacted/ }).check();
  await Promise.all([
    page.waitForURL("**/api/contact"),
    form.getByRole("button", { name: "Request a free quote" }).click(),
  ]);
  const text = await page.locator("body").innerText();
  if (/Message not sent/.test(text) && /needs JavaScript for its spam check/.test(text))
    pass("plain POST reaches the Worker, which answers with a page explaining why it was not sent");
  else fail(route, `unexpected reply to a plain POST: ${text.slice(0, 200)}`);
  await context.close();
}

async function checkJsonLd(): Promise<void> {
  console.log("\nJSON-LD in dist/");
  const dist = path.join(ROOT, "dist");
  const files = (await fs.readdir(dist, { recursive: true })).filter((f) => String(f).endsWith(".html"));
  let blocks = 0;
  const seen = new Set<string>();
  const walk = (node: unknown, file: string) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, file));
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    for (const type of [record["@type"]].flat()) {
      if (typeof type !== "string") continue;
      seen.add(type);
      if (!SCHEMA_TYPES.has(type)) fail(file, `unknown schema.org type "${type}"`);
    }
    Object.values(record).forEach((value) => walk(value, file));
  };
  for (const file of files) {
    const html = await fs.readFile(path.join(dist, String(file)), "utf8");
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      blocks++;
      try {
        const data = JSON.parse(match[1]) as Record<string, unknown>;
        if (data["@context"] !== "https://schema.org")
          fail(String(file), "JSON-LD without the schema.org context");
        walk(data, String(file));
      } catch (error) {
        fail(String(file), `JSON-LD does not parse: ${(error as Error).message}`);
      }
    }
  }
  pass(`${blocks} blocks in ${files.length} pages parse; types used: ${[...seen].sort().join(", ")}`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    for (const { route, endpoint } of PAGES) await checkPage(browser, route, endpoint);
    await checkWithoutJavaScript(browser);
  } finally {
    await browser.close();
  }
  await checkJsonLd();

  console.log(
    problems.length
      ? `\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`
      : "\nAll form checks passed.",
  );
  process.exit(problems.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
