/* Error pages: the "TRY AGAIN" button reloads the failed URL (nginx serves the error page at the
   original address, so a reload retries it). On the 429 page it stays locked for a countdown. */
(function () {
  var retry = document.getElementById('retry');
  if (!retry) return;

  var wait = Number(retry.getAttribute('data-wait') || 0);
  var label = retry.getAttribute('data-label') || 'TRY AGAIN';

  function unlock() {
    retry.classList.remove('is-disabled');
    retry.removeAttribute('aria-disabled');
    retry.textContent = label;
  }

  retry.addEventListener('click', function (event) {
    event.preventDefault();
    if (retry.getAttribute('aria-disabled') === 'true') return;
    window.location.reload();
  });

  if (wait > 0) {
    var left = wait;
    retry.setAttribute('aria-disabled', 'true');
    retry.classList.add('is-disabled');
    retry.textContent = label + ' IN ' + left + 'S';
    var timer = window.setInterval(function () {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(timer);
        unlock();
      } else {
        retry.textContent = label + ' IN ' + left + 'S';
      }
    }, 1000);
  }
})();
