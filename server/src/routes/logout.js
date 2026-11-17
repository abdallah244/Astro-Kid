import {
  deleteSessionByRequest,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../auth/session.js';
import { verifyCsrf } from '../lib/csrf.js';

export function registerLogoutRoute(fastify, { db, config }) {
  const csrf = verifyCsrf(config.SITE_ORIGIN);

  fastify.post('/api/auth/logout', { preHandler: [csrf] }, async (request, reply) => {
    await deleteSessionByRequest(db, request);
    reply.clearCookie(SESSION_COOKIE_NAME, {
      ...getSessionCookieOptions(config),
      maxAge: undefined,
    });
    return { ok: true };
  });
}
