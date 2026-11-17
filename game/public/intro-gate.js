/* Runs synchronously in <head> (before first paint) so the page never flashes
   before the first-visit intro. Kept as a tiny external classic script because
   the site's Content-Security-Policy forbids inline scripts. */
(function () {
  try {
    // signed-in hint (set by site.js): reserve the account area in the navbar until /api/me answers
    if (localStorage.getItem('ak_signed_in_hint') === '1') {
      document.documentElement.classList.add('auth-pending');
    }
  } catch (e) {
    /* storage blocked */
  }
  try {
    var path = location.pathname;
    var isHome = path === '/' || /\/index\.html$/.test(path);
    var seen = localStorage.getItem('ak_intro_seen_v1');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var returningFromAuth = /[?&]auth=/.test(location.search);
    if (isHome && !seen && !reduce && !location.hash && !returningFromAuth) {
      document.documentElement.classList.add('intro-pending');
    }
  } catch (e) {
    /* storage blocked: no intro */
  }
})();
