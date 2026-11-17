import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SITE_ORIGIN: z
    .string()
    .url('SITE_ORIGIN must be a valid URL (e.g. http://localhost:5173)')
    .transform((v) => new URL(v).origin),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_REDIRECT_URI: z
    .string()
    .url('GOOGLE_REDIRECT_URI must be a valid URL'),
  RELEASES_DIR: z.string().min(1).default('./releases'),
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECRET: z.string().optional(),
  HOST: z.string().min(1).default('127.0.0.1'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export function loadConfig(rawEnv = process.env) {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server environment configuration:\n${details}`);
  }

  const data = parsed.data;
  const cookieSecret =
    data.COOKIE_SECRET && data.COOKIE_SECRET.length >= 16
      ? data.COOKIE_SECRET
      : crypto
          .createHash('sha256')
          .update(`${data.GOOGLE_CLIENT_SECRET}:${data.DATABASE_URL}:astro-kid`)
          .digest('hex');

  return {
    ...data,
    RELEASES_DIR: path.resolve(data.RELEASES_DIR),
    COOKIE_SECRET: cookieSecret,
  };
}
