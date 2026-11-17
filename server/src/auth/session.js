import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'ak_session';

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest();
}

export function getSessionCookieOptions(config) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    maxAge: config.SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function createSession(db, config, userId) {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + config.SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.query(
    `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return rawToken;
}

export async function readSessionFromRequest(db, request) {
  const rawToken = request.cookies?.[SESSION_COOKIE_NAME];
  if (!rawToken || typeof rawToken !== 'string') return null;

  const tokenHash = hashToken(rawToken);
  const res = await db.query(
    `select s.id as session_id, u.id as user_id, u.email, u.avatar_url
     from sessions s
     join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash]
  );

  return res.rows[0] ?? null;
}

export async function deleteSessionByRequest(db, request) {
  const rawToken = request.cookies?.[SESSION_COOKIE_NAME];
  if (!rawToken || typeof rawToken !== 'string') return;
  const tokenHash = hashToken(rawToken);
  await db.query(`delete from sessions where token_hash = $1`, [tokenHash]);
}

export async function purgeExpiredSessions(db) {
  await db.query(`delete from sessions where expires_at <= now()`);
}
