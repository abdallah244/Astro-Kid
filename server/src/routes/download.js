import fs from 'node:fs';
import path from 'node:path';
import { readSessionFromRequest } from '../auth/session.js';

const INSTALLER_FILENAME = 'AstroKid-Setup.exe';

export function registerDownloadRoute(fastify, { db, config }) {
  const handleDownload = async (request, reply) => {
    const session = await readSessionFromRequest(db, request);
    if (!session) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }

    const profRes = await db.query(
      `select 1 from profiles where user_id = $1`,
      [session.user_id]
    );
    if (profRes.rowCount === 0) {
      return reply.code(403).send({ error: 'profile_required' });
    }

    const filePath = path.join(config.RELEASES_DIR, INSTALLER_FILENAME);
    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      return reply.code(404).send({ error: 'not_published' });
    }

    if (!stat.isFile()) {
      return reply.code(404).send({ error: 'not_published' });
    }

    reply.header(
      'Content-Disposition',
      `attachment; filename="${INSTALLER_FILENAME}"`
    );
    reply.header('Cache-Control', 'no-store');

    if (config.NODE_ENV === 'production') {
      // Hand off streaming to nginx internal location /_protected/
      reply.header('X-Accel-Redirect', `/_protected/${INSTALLER_FILENAME}`);
      return reply.code(200).send();
    }

    reply.type('application/octet-stream');
    reply.header('Content-Length', String(stat.size));
    if (request.method === 'HEAD') {
      return reply.code(200).send();
    }

    return reply.send(fs.createReadStream(filePath));
  };

  fastify.get('/api/download', handleDownload);
}
