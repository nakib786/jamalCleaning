/**
 * Light / dark theme switch.
 *
 * The theme is the `data-theme` attribute on <html> ("light" or "dark"); the colours for each are
 * in src/styles/global.css. The inline script in BaseLayout sets it before the first paint (so the
 * page never flashes the wrong theme); this module keeps it up to date afterwards:
 *   - every `[data-theme-toggle]` button (ThemeToggle.astro) switches it and saves the choice
 *   - with no saved choice it follows `site.defaultTheme` (by default the device's own setting,
 *     including when that changes while the page is open)
 *   - a choice made in another tab, or on another page before coming back with the Back button,
 *     is picked up
 * Other scripts can listen for the `themechange` event on `document` (detail: "light" | "dark").
 */
export type Theme = "light" | "dark";

/** localStorage key; the inline script in BaseLayout reads the same one. */
const STORAGE_KEY = "theme";
const root = document.documentElement;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

/** The visitor's saved choice, if any (storage can be blocked, e.g. in private windows). */
function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** The theme to show: the saved choice, else the site default, else the device setting. */
function resolveTheme(): Theme {
  const saved = savedTheme();
  if (saved) return saved;
  const fallback = root.dataset.themeDefault;
  if (fallback === "light" || fallback === "dark") return fallback;
  return systemDark.matches ? "dark" : "light";
}

function syncToggles(theme: Theme): void {
  document
    .querySelectorAll<HTMLElement>("[data-theme-toggle]")
    .forEach((button) => button.setAttribute("aria-pressed", String(theme === "dark")));
}

function applyTheme(theme: Theme): void {
  syncToggles(theme);
  if (root.dataset.theme === theme) return;
  // Switch with transitions off, so the whole page changes at once (see `.theme-switching` in
  // global.css). They come back two frames later: the first frame paints the new colours.
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  document.dispatchEvent(new CustomEvent<Theme>("themechange", { detail: theme }));
}

document.querySelectorAll<HTMLElement>("[data-theme-toggle]").forEach((button) =>
  button.addEventListener("click", () => {
    const next: Theme = root.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the switch still works for this page view.
    }
    applyTheme(next);
  }),
);

// Follow the device setting while the visitor has not chosen for themselves.
systemDark.addEventListener("change", () => applyTheme(resolveTheme()));
// A choice made in another tab.
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null) applyTheme(resolveTheme());
});
// A page restored by the Back / Forward buttons may show the theme from before a switch.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) applyTheme(resolveTheme());
});

applyTheme(resolveTheme());
