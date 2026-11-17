import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const INSTALLER_FILENAME = 'AstroKid-Setup.exe';
const MANIFEST_FILENAME = 'release.json';
const DEFAULT_PLATFORM = 'Windows 10 / 11 (64-bit)';

const releaseManifestSchema = z.object({
  version: z.string().trim().min(1).max(64),
  releasedAt: z.string().trim().min(4).max(32),
  sha256: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/)
    .transform((hex) => hex.toLowerCase()),
  filename: z.string().trim().min(1).max(128).optional(),
  platform: z.string().trim().min(1).max(128).optional(),
});

async function readReleasePayload(releasesDir) {
  const manifestPath = path.join(releasesDir, MANIFEST_FILENAME);
  const installerPath = path.join(releasesDir, INSTALLER_FILENAME);

  let rawManifest;
  let stat;
  try {
    [rawManifest, stat] = await Promise.all([
      fs.promises.readFile(manifestPath, 'utf8'),
      fs.promises.stat(installerPath),
    ]);
  } catch {
    return { published: false };
  }

  if (!stat.isFile()) {
    return { published: false };
  }

  let json;
  try {
    json = JSON.parse(rawManifest);
  } catch {
    return { published: false };
  }

  const parsed = releaseManifestSchema.safeParse(json);
  if (!parsed.success) {
    return { published: false };
  }

  const data = parsed.data;
  return {
    published: true,
    version: data.version,
    releasedAt: data.releasedAt,
    sizeBytes: stat.size,
    sha256: data.sha256,
    filename: data.filename || INSTALLER_FILENAME,
    platform: data.platform || DEFAULT_PLATFORM,
  };
}

export function registerReleaseRoute(fastify, { config }) {
  fastify.get(
    '/api/release',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    async (_request, reply) => {
      const payload = await readReleasePayload(config.RELEASES_DIR);
      reply.header('Cache-Control', 'public, max-age=60');
      return reply.code(200).send(payload);
    }
  );
}
