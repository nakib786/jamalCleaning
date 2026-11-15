/**
 * Progressive enhancement for every `form[data-api-form]`:
 *   - loads Cloudflare Turnstile on first interaction (nothing is downloaded on page load)
 *   - submits the fields as JSON to the form's `action` (the Worker in worker/index.ts)
 *   - shows each problem next to the field it belongs to (`[data-error-for="<field name>"]`),
 *     for the browser's own checks and for the Worker's replies
 *   - shows the result as text in the form's `.form-status` element (role="status")
 * Without JavaScript the form posts normally, but Turnstile cannot run, so the Worker answers with a
 * page that says so and points to the other ways to get in touch.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      getResponse: (id?: string) => string | undefined;
    };
  }
}

// Cloudflare's always-pass test key is used when no site key is configured (local dev).
const SITE_KEY: string = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
let turnstileLoading: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  turnstileLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.append(script);
  });
  return turnstileLoading;
}

function setStatus(form: HTMLFormElement, message: string, kind: "ok" | "error" | "busy"): void {
  const status = form.querySelector<HTMLElement>(".form-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function controls(form: HTMLFormElement): Control[] {
  return [...form.elements].filter(
    (el): el is Control =>
      el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement,
  );
}

/** Writes (or clears, with "") the message under a field. False when the form has no place for it. */
function setFieldError(form: HTMLFormElement, control: Control, message: string): boolean {
  const slot = form.querySelector<HTMLElement>(`[data-error-for="${CSS.escape(control.name)}"]`);
  if (!slot) return false;
  slot.textContent = message;
  if (message) control.setAttribute("aria-invalid", "true");
  else control.removeAttribute("aria-invalid");
  return true;
}

/**
 * Checks every field and puts each problem next to its field, then moves focus to the first one.
 * Forms without message slots (the newsletter) keep the browser's own bubbles.
 */
function validate(form: HTMLFormElement): boolean {
  if (!form.noValidate) return form.reportValidity();
  let firstInvalid: Control | undefined;
  for (const control of controls(form)) {
    if (!control.willValidate) continue;
    const { valid, valueMissing } = control.validity;
    const message = valid
      ? ""
      : ((valueMissing ? control.dataset.errorMissing : control.dataset.errorInvalid) ??
        control.validationMessage);
    setFieldError(form, control, message);
    if (!valid) firstInvalid ??= control;
  }
  if (!firstInvalid) return true;
  firstInvalid.focus();
  setStatus(form, "Please check the fields marked above.", "error");
  return false;
}

async function ensureWidget(form: HTMLFormElement): Promise<string | undefined> {
  const slot = form.querySelector<HTMLElement>("[data-turnstile]");
  if (!slot) return undefined;
  await loadTurnstile();
  if (!slot.dataset.widgetId && window.turnstile) {
    slot.dataset.widgetId = window.turnstile.render(slot, {
      sitekey: SITE_KEY,
      size: "normal",
      // Always visible so visitors see the spam check on every form; dark style on dark sections.
      appearance: "always",
      theme: slot.dataset.theme === "dark" ? "dark" : "light",
    });
  }
  return slot.dataset.widgetId;
}

function enhance(form: HTMLFormElement): void {
  const warmUp = () => void ensureWidget(form).catch(() => undefined);
  form.addEventListener("focusin", warmUp, { once: true });
  form.addEventListener("pointerenter", warmUp, { once: true });

  // With message slots in the form, problems are shown next to the fields instead of in browser bubbles.
  form.noValidate = form.querySelector("[data-error-for]") !== null;
  const clearWhenFixed = (event: Event) => {
    const control = event.target as Control;
    if (control.getAttribute?.("aria-invalid") && control.validity.valid) setFieldError(form, control, "");
  };
  form.addEventListener("input", clearWhenFixed);
  form.addEventListener("change", clearWhenFixed);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validate(form)) return;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    button?.setAttribute("disabled", "");
    setStatus(form, "Sending…", "busy");
    try {
      const widgetId = await ensureWidget(form);
      let token = window.turnstile?.getResponse(widgetId);
      for (let i = 0; !token && i < 40; i++) {
        await new Promise((r) => setTimeout(r, 250));
        token = window.turnstile?.getResponse(widgetId);
      }
      const body = Object.fromEntries(new FormData(form).entries());
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...body, turnstileToken: token ?? "" }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        field?: string;
      };
      if (!response.ok || !result.ok) {
        const message = result.error ?? "Something went wrong. Please call us instead.";
        // The Worker names the field a problem belongs to: show it there and move focus to it.
        const control = controls(form).find((c) => c.name === result.field);
        if (control && setFieldError(form, control, message)) {
          control.focus();
          throw new Error("Please check the fields marked above.");
        }
        throw new Error(message);
      }
      form.reset();
      setStatus(form, form.dataset.success ?? "Thank you! We'll get back to you shortly.", "ok");
    } catch (error) {
      setStatus(form, (error as Error).message, "error");
    } finally {
      window.turnstile?.reset(form.querySelector<HTMLElement>("[data-turnstile]")?.dataset.widgetId);
      button?.removeAttribute("disabled");
    }
  });
}

document.querySelectorAll<HTMLFormElement>("form[data-api-form]").forEach(enhance);
