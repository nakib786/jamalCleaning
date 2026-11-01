/**
 * Progressive enhancement for every `form[data-api-form]`:
 *   - loads Cloudflare Turnstile on first interaction (nothing is downloaded on page load)
 *   - submits the fields as JSON to the form's `action` (the Worker in worker/index.ts)
 *   - shows the result in the form's `.form-status` element
 * Without JavaScript the form still posts normally and the Worker redirects back.
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
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
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok)
        throw new Error(result.error ?? "Something went wrong. Please call us instead.");
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
