import { z } from 'zod';
import { readSessionFromRequest } from '../auth/session.js';
import { verifyCsrf } from '../lib/csrf.js';
import { validateFullName } from '../lib/validateName.js';

const profileBodySchema = z.object({
  fullName: z.string().min(1).max(200),
  consent: z.object({
    acceptedAt: z.string().min(1).max(64),
    policyVersion: z.string().min(1).max(40),
    text: z.string().min(1).max(500),
  }),
  source: z.string().max(120).optional().nullable(),
});

export function registerProfileRoute(fastify, { db, config, notifier }) {
  const csrf = verifyCsrf(config.SITE_ORIGIN);

  fastify.post(
    '/api/profile',
    {
      preHandler: [csrf],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const session = await readSessionFromRequest(db, request);
      if (!session) {
        return reply.code(401).send({ error: 'unauthenticated' });
      }

      const parsed = profileBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_payload' });
      }

      const nameCheck = validateFullName(parsed.data.fullName);
      if (!nameCheck.valid) {
        return reply.code(400).send({ error: 'invalid_full_name' });
      }

      const acceptedMs = Date.parse(parsed.data.consent.acceptedAt);
      if (!Number.isFinite(acceptedMs) || acceptedMs > Date.now() + 60_000) {
        return reply.code(400).send({ error: 'invalid_consent_timestamp' });
      }

      const consentText = parsed.data.consent.text.trim();
      const policyVersion = parsed.data.consent.policyVersion.trim();
      if (!consentText || consentText.length > 500 || !policyVersion) {
        return reply.code(400).send({ error: 'invalid_consent' });
      }

      const signupSource = parsed.data.source
        ? parsed.data.source.trim().slice(0, 120)
        : 'direct';

      const existing = await db.query(
        `select 1 from profiles where user_id = $1`,
        [session.user_id]
      );
      if (existing.rowCount > 0) {
        return reply.code(409).send({ error: 'profile_exists' });
      }

      try {
        const inserted = await db.query(
          `insert into profiles (
             user_id, full_name, terms_accepted_at, policy_version, consent_text, signup_source
           ) values ($1, $2, $3, $4, $5, $6)
           returning full_name, created_at`,
          [
            session.user_id,
            nameCheck.fullName,
            new Date(acceptedMs).toISOString(),
            policyVersion,
            consentText,
            signupSource,
          ]
        );

        const row = inserted.rows[0];

        if (notifier?.enabled) {
          db.query(`select count(*)::int as n from profiles`)
            .then((r) => notifier.signup({ total: r.rows[0]?.n }))
            .catch(() => notifier.signup({}));
        }
        return reply.code(201).send({
          profile: {
            fullName: row.full_name,
            createdAt: row.created_at,
          },
        });
      } catch (err) {
        if (err?.code === '23505') {
          return reply.code(409).send({ error: 'profile_exists' });
        }
        if (err?.code === '23514') {
          return reply.code(400).send({ error: 'invalid_full_name' });
        }
        throw err;
      }
    }
  );
}
