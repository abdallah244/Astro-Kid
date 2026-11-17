import crypto from 'node:crypto';

/**
 * Remove a deleted user's email from the Developer's external marketing mailing list.
 * Currently a documented no-op stub: logs `marketing.remove` using a SHA-256 hash
 * (never plaintext PII) until an email service provider is integrated.
 * See `deploy/DEPLOY.md` section "Marketing list".
 *
 * @param {string} email
 * @param {{ info?: Function }} [logger]
 */
export async function removeFromMarketingList(email, logger = null) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const emailHash = crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 16);

  if (logger && typeof logger.info === 'function') {
    logger.info({ event: 'marketing.remove', emailHash }, 'marketing.remove');
  }
}
