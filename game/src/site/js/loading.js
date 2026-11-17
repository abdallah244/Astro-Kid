/* Button loading state: swaps the label for "<LABEL> ..." with three blinking dots,
   disables the button and marks it busy. clearButtonLoading() restores it exactly. */

const DOTS = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';

export function setButtonLoading(btn, label) {
  if (!btn) return;
  if (btn.dataset.loadingOriginal === undefined) {
    btn.dataset.loadingOriginal = btn.innerHTML;
  }
  btn.disabled = true;
  btn.setAttribute('aria-disabled', 'true');
  btn.setAttribute('aria-busy', 'true');
  btn.classList.add('is-loading');
  btn.replaceChildren(document.createTextNode(label));
  btn.insertAdjacentHTML('beforeend', DOTS);
}

export function clearButtonLoading(btn) {
  if (!btn) return;
  if (btn.dataset.loadingOriginal !== undefined) {
    btn.innerHTML = btn.dataset.loadingOriginal;
    delete btn.dataset.loadingOriginal;
  }
  btn.disabled = false;
  btn.setAttribute('aria-disabled', 'false');
  btn.removeAttribute('aria-busy');
  btn.classList.remove('is-loading');
}
