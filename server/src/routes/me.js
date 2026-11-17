import { readSessionFromRequest } from '../auth/session.js';

export function registerMeRoute(fastify, { db }) {
  fastify.get('/api/me', async (request, reply) => {
    const session = await readSessionFromRequest(db, request);
    if (!session) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }

    const profRes = await db.query(
      `select full_name, created_at from profiles where user_id = $1`,
      [session.user_id]
    );
    const prof = profRes.rows[0] ?? null;

    return {
      user: {
        email: session.email,
        avatarUrl: session.avatar_url || null,
      },
      profile: prof
        ? {
            fullName: prof.full_name,
            createdAt: prof.created_at,
          }
        : null,
    };
  });
}
