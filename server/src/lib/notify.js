/**
 * Optional "someone signed up" ping for the owner, sent to a Telegram chat.
 *
 * Privacy: the message carries no personal data (no name, no email), only the running total,
 * so no user data leaves the server. The owner reads the details on the server with
 * `npm run signups` (see deploy/DOCKER.md).
 *
 * Enabled only when both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set. Never throws and never
 * delays the sign-up response: failures are logged and ignored.
 */
export function createSignupNotifier({ token, chatId, siteName = 'Astro Kid', fetchImpl = globalThis.fetch, log } = {}) {
  const enabled = Boolean(token && chatId && typeof fetchImpl === 'function');

  async function send(text) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: controller.signal,
      });
      if (!res.ok) log?.warn?.({ status: res.status }, 'signup notification failed');
    } catch (err) {
      log?.warn?.({ message: err?.message }, 'signup notification failed');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    enabled,
    /** Fire and forget. `total` is the number of completed sign-ups after this one. */
    signup({ total } = {}) {
      if (!enabled) return;
      const count = Number.isFinite(total) ? ` Total sign-ups: ${total}.` : '';
      void send(`${siteName}: a new player signed up.${count}`);
    },
  };
}
