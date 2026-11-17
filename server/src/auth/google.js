import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import {
  createSession,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from './session.js';

const OAUTH_COOKIE_NAME = 'ak_oauth';

function base64Url(buf) {
  return buf.toString('base64url');
}

function generatePkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function registerGoogleAuthRoutes(fastify, { db, config, oauthClient }) {
  const client =
    oauthClient ||
    new OAuth2Client(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
      config.GOOGLE_REDIRECT_URI
    );

  const oauthRateLimit = {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  };

  fastify.get('/api/auth/google/start', oauthRateLimit, async (request, reply) => {
    // Only the Windows download requires sign-in; legacy ?intent=demo links normalize to 'download'.
    const intent = request.query?.intent === 'download' || request.query?.intent === 'demo'
      ? 'download'
      : 'download';
    const state = crypto.randomBytes(24).toString('hex');
    const { verifier, challenge } = generatePkcePair();

    const payload = JSON.stringify({ state, verifier, intent });
    reply.setCookie(OAUTH_COOKIE_NAME, payload, {
      path: '/api/auth/google',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: 600,
      signed: true,
    });

    const url = client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      redirect_uri: config.GOOGLE_REDIRECT_URI,
    });

    return reply.redirect(url, 302);
  });

  fastify.get('/api/auth/google/callback', oauthRateLimit, async (request, reply) => {
    const failRedirect = `${config.SITE_ORIGIN}/?auth=error`;
    const clearOauthCookie = () => {
      reply.clearCookie(OAUTH_COOKIE_NAME, { path: '/api/auth/google' });
    };

    try {
      if (request.query?.error) {
        clearOauthCookie();
        return reply.redirect(failRedirect, 302);
      }

      const code = request.query?.code;
      const queryState = request.query?.state;
      const signedCookie = request.cookies?.[OAUTH_COOKIE_NAME];
      if (!code || !queryState || !signedCookie) {
        clearOauthCookie();
        return reply.redirect(failRedirect, 302);
      }

      const unsigned = request.unsignCookie(signedCookie);
      if (!unsigned?.valid || !unsigned.value) {
        clearOauthCookie();
        return reply.redirect(failRedirect, 302);
      }

      const { state, verifier } = JSON.parse(unsigned.value);
      if (!state || !verifier || state !== queryState) {
        clearOauthCookie();
        return reply.redirect(failRedirect, 302);
      }

      const { tokens } = await client.getToken({
        code: String(code),
        codeVerifier: String(verifier),
        redirect_uri: config.GOOGLE_REDIRECT_URI,
      });

      if (!tokens?.id_token) {
        clearOauthCookie();
        return reply.redirect(failRedirect, 302);
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.GOOGLE_CLIENT_ID,
      });

      const googleUser = ticket.getPayload();
      if (
        !googleUser ||
        !googleUser.sub ||
        !googleUser.email ||
        googleUser.email_verified !== true
      ) {
        clearOauthCookie();
        return reply.redirect(failRedirect, 302);
      }

      // Insert user ONLY on first sign-in; never overwrite email or avatar_url on subsequent logins.
      await db.query(
        `insert into users (google_sub, email, avatar_url)
         values ($1, $2, $3)
         on conflict (google_sub) do nothing`,
        [googleUser.sub, googleUser.email, googleUser.picture || null]
      );

      const userRow = await db.query(
        `select id from users where google_sub = $1`,
        [googleUser.sub]
      );
      const userId = userRow.rows[0]?.id;
      if (!userId) {
        clearOauthCookie();
        return reply.redirect(failRedirect, 302);
      }

      const sessionToken = await createSession(db, config, userId);
      clearOauthCookie();
      reply.setCookie(
        SESSION_COOKIE_NAME,
        sessionToken,
        getSessionCookieOptions(config)
      );

      return reply.redirect(`${config.SITE_ORIGIN}/?auth=done`, 302);
    } catch (err) {
      request.log.error({ err: err?.message }, 'Google OAuth callback failed');
      clearOauthCookie();
      return reply.redirect(failRedirect, 302);
    }
  });
}
