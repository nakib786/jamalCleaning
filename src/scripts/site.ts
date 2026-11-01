/**
 * Site-wide behaviour (replaces the theme's jQuery plugins):
 *   - [data-reveal] entrance animations via IntersectionObserver (was Elementor + Waypoints)
 *   - [data-counter] count-up numbers (was jquery-numerator)
 *   - Lenis smooth scrolling on desktop > 992px (same settings as the theme)
 *   - scroll-to-top button after 200px
 */
import Lenis from "lenis";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Entrance animations ------------------------------------------------------ */
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-revealed");
      revealObserver.unobserve(entry.target);
    }
  },
  { rootMargin: "0px 0px -8% 0px" },
);
document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
  if (el.dataset.revealDelay) el.style.setProperty("--reveal-delay", `${el.dataset.revealDelay}ms`);
  // Drop the animation once it has played, so it never replays (e.g. when a responsive
  // display toggle hides and re-shows the element on rotate/resize).
  el.addEventListener("animationend", (event) => {
    if (event.target === el) el.classList.add("reveal-done");
  });
  revealObserver.observe(el);
});

/* Counters --------------------------------------------------------------------- */
function runCounter(el: HTMLElement): void {
  const target = Number(el.dataset.counter ?? el.textContent ?? 0);
  const duration = Number(el.dataset.duration ?? 2000);
  if (reducedMotion || !Number.isFinite(target)) {
    el.textContent = String(target);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const counterObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      runCounter(entry.target as HTMLElement);
      counterObserver.unobserve(entry.target);
    }
  },
  { threshold: 0.4 },
);
document.querySelectorAll<HTMLElement>("[data-counter]").forEach((el) => {
  if (!reducedMotion) el.textContent = "0";
  counterObserver.observe(el);
});

/* Smooth scrolling (theme: Lenis, duration 1.5, desktop only) --------------- */
let lenis: Lenis | null = null;
let rafId = 0;
function syncLenis(): void {
  const wanted = !reducedMotion && window.innerWidth > 992;
  if (wanted && !lenis) {
    lenis = new Lenis({
      duration: 1.5,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 2,
    });
    const raf = (time: number) => {
      lenis?.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
  } else if (!wanted && lenis) {
    cancelAnimationFrame(rafId);
    lenis.destroy();
    lenis = null;
  }
}
syncLenis();
window.addEventListener("resize", syncLenis, { passive: true });

/* Scroll to top -------------------------------------------------------------- */
const scrollTop = document.querySelector<HTMLElement>("[data-scroll-top]");
if (scrollTop) {
  const toggle = () => scrollTop.classList.toggle("is-visible", window.scrollY > 200);
  window.addEventListener("scroll", toggle, { passive: true });
  toggle();
  scrollTop.addEventListener("click", () => {
    if (lenis) lenis.scrollTo(0, { duration: 1.2 });
    else window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  });
}
