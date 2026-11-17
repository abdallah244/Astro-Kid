import {
  getSessionCookieOptions,
  readSessionFromRequest,
  SESSION_COOKIE_NAME,
} from '../auth/session.js';
import { verifyCsrf } from '../lib/csrf.js';
import { removeFromMarketingList } from '../lib/marketing.js';

export function registerAccountRoute(fastify, { db, config, marketing } = {}) {
  const csrf = verifyCsrf(config.SITE_ORIGIN);
  const removeEmail =
    marketing?.removeFromMarketingList ?? removeFromMarketingList;

  fastify.delete('/api/account', { preHandler: [csrf] }, async (request, reply) => {
    const session = await readSessionFromRequest(db, request);
    if (!session) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }

    // See deploy/DEPLOY.md ("Marketing list") before connecting an external mailing provider.
    try {
      await removeEmail(session.email, request.log);
    } catch (err) {
      request.log.warn(
        { code: err?.code, message: err?.message },
        'marketing.remove.failed'
      );
    }

    await db.query(`delete from users where id = $1`, [session.user_id]);

    reply.clearCookie(SESSION_COOKIE_NAME, {
      ...getSessionCookieOptions(config),
      maxAge: undefined,
    });

    return reply.code(204).send();
  });
}
