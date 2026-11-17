/* Hides the /play.html pre-loader as soon as the game has created its canvas
   (from there the game's own loading scene takes over). Classic external script:
   the site's CSP forbids inline scripts. */
(function () {
  var loader = document.getElementById('boot-loader');
  var game = document.getElementById('game');
  if (!loader || !game) return;

  function hide() {
    if (loader.classList.contains('is-done')) return;
    loader.classList.add('is-done');
    window.setTimeout(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 600);
  }

  if (game.querySelector('canvas')) {
    hide();
    return;
  }

  var observer = new MutationObserver(function () {
    if (game.querySelector('canvas')) {
      observer.disconnect();
      hide();
    }
  });
  observer.observe(game, { childList: true, subtree: true });

  // failsafe: never keep the cover forever (slow network, blocked script...)
  window.setTimeout(hide, 20000);
})();
