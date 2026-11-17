/* Scroll-reveal for the landing page (home only).
   - Elements are tagged from a selector list (no HTML churn) and observed by ONE
     IntersectionObserver; each element animates once and is then un-observed.
   - Hero and header are never touched (LCP stays instant).
   - Skipped entirely for prefers-reduced-motion or browsers without IntersectionObserver. */

const RULES = [
  // section headers and copy
  ['.learn__inner > .chip, .learn__title, .learn__sub', 'up'],
  ['.nova-row', 'up'],
  ['.learn__card', 'up'],
  ['.about-teaser__inner > *', 'up'],
  ['.cta-section__copy > *', 'up'],
  ['.site-footer__top > *, .site-footer__bottom', 'up'],
  // pictures and markers
  ['.learn__map', 'pop'],
  ['.learn__pin', 'pop'],
  ['.orbit-scene__earth, .orbit-scene__moon, .orbit-scene__nova', 'pop'],
  // About page cards and headings (excludes hero, toolbox pile & animated CTA scene)
  ['.about-map__header > .chip, .about-map__header > .px-title, .about-map__header > .about-map__lead, .about-map__step, .about-map__card', 'up'],
  ['.about-crew__header > *, .about-crew__card', 'up'],
  ['.about-world__header > *, .about-world__map-frame, .about-world__card, .about-world__pair', 'up'],
  ['.about-outpost__header > *, .about-outpost__card, .tech-branch, .about-outpost__step, .about-outpost__processor', 'up'],
  // Download page cards and headings (excludes hero panel)
  ['.dl-install__head > *, .dl-step, .dl-card, .dl-faq__head > *, .dl-faq__item, .dl-side-card, .dl-help', 'up'],
];

const PIN_START_MS = 380; // map pops first, then pins one after another
const PIN_STEP_MS = 110;
const STAGGER_MS = 80;
const STAGGER_MAX = 4;

export function initReveal() {
  const html = document.documentElement;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = [];
  RULES.forEach(([selector, kind]) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (el.dataset.reveal || el.closest('.hero, .about-hero, .dl-hero, .site-header')) return;
      el.dataset.reveal = kind;
      targets.push(el);
    });
  });
  if (targets.length === 0) return;

  // stagger siblings that share a parent
  const seen = new Map();
  targets.forEach((el) => {
    const parent = el.parentElement;
    const index = seen.get(parent) ?? 0;
    seen.set(parent, index + 1);
    const delay = el.classList.contains('learn__pin')
      ? PIN_START_MS + index * PIN_STEP_MS
      : Math.min(index, STAGGER_MAX) * STAGGER_MS;
    el.style.setProperty('--rd', `${delay}ms`);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        observer.unobserve(el);
        el.classList.add('is-in');
        el.addEventListener(
          'animationend',
          (event) => {
            if (event.target !== el) return;
            // back to the plain element: no leftover rules, no leftover compositor layer
            el.removeAttribute('data-reveal');
            el.classList.remove('is-in');
            el.style.removeProperty('--rd');
          },
          { once: true }
        );
      });
    },
    // no negative rootMargin: the last elements of the page (footer) sit inside that margin
    // when scrolled to the bottom and would never be revealed
    { threshold: 0.08 }
  );

  html.classList.add('reveal-ready');
  targets.forEach((el) => observer.observe(el));

  // never leave anything hidden if the page is printed
  window.addEventListener('beforeprint', () => {
    observer.disconnect();
    targets.forEach((el) => el.removeAttribute('data-reveal'));
  });
}
