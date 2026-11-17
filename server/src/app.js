import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerGoogleAuthRoutes } from './auth/google.js';
import { registerMeRoute } from './routes/me.js';
import { registerProfileRoute } from './routes/profile.js';
import { registerDownloadRoute } from './routes/download.js';
import { registerReleaseRoute } from './routes/release.js';
import { registerLogoutRoute } from './routes/logout.js';
import { registerAccountRoute } from './routes/account.js';
import { createSignupNotifier } from './lib/notify.js';

export async function buildApp({ db, config, oauthClient, logger, marketing, notifier } = {}) {
  const fastify = Fastify({
    trustProxy: true,
    logger:
      logger ??
      (config.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
          }),
  });

  await fastify.register(helmet);
  await fastify.register(cookie, {
    secret: config.COOKIE_SECRET,
  });
  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  fastify.get('/api/health', async () => ({ ok: true }));

  registerGoogleAuthRoutes(fastify, { db, config, oauthClient });
  registerMeRoute(fastify, { db });
  const signupNotifier =
    notifier ??
    createSignupNotifier({
      token: config.TELEGRAM_BOT_TOKEN,
      chatId: config.TELEGRAM_CHAT_ID,
      log: fastify.log,
    });
  registerProfileRoute(fastify, { db, config, notifier: signupNotifier });
  registerDownloadRoute(fastify, { db, config });
  registerReleaseRoute(fastify, { config });
  registerLogoutRoute(fastify, { db, config });
  registerAccountRoute(fastify, { db, config, marketing });

  fastify.setErrorHandler((err, request, reply) => {
    request.log.error({ code: err?.code, message: err?.message }, 'Unhandled API error');
    const status = Number(err?.statusCode) >= 400 && Number(err?.statusCode) < 500
      ? Number(err.statusCode)
      : 500;
    const code = status === 429 ? 'rate_limited' : status < 500 ? 'bad_request' : 'internal_error';
    reply.code(status).send({ error: code });
  });

  return fastify;
}
