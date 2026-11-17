import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { removeFromMarketingList } from '../src/lib/marketing.js';

function createInMemoryDb() {
  const users = [];
  const profiles = [];
  const sessions = [];

  return {
    users,
    profiles,
    sessions,
    async query(sqlText, params = []) {
      const sql = sqlText.replace(/\s+/g, ' ').trim().toLowerCase();

      if (sql.startsWith('insert into users')) {
        const [sub, email, avatarUrl] = params;
        const existingSub = users.find((u) => u.google_sub === sub);
        if (existingSub) {
          return { rows: [], rowCount: 0 };
        }
        const existingEmail = users.find(
          (u) => u.email.toLowerCase() === email.toLowerCase()
        );
        if (existingEmail) {
          const err = new Error('duplicate key value violates unique index users_email_lower_key');
          err.code = '23505';
          throw err;
        }
        const row = {
          id: crypto.randomUUID(),
          google_sub: sub,
          email,
          avatar_url: avatarUrl,
          created_at: new Date(),
        };
        users.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (sql.startsWith('select id from users where google_sub =')) {
        const u = users.find((x) => x.google_sub === params[0]);
        return { rows: u ? [{ id: u.id }] : [], rowCount: u ? 1 : 0 };
      }

      if (sql.startsWith('insert into sessions')) {
        const [userId, tokenHash, expiresAt] = params;
        const row = {
          id: crypto.randomUUID(),
          user_id: userId,
          token_hash: Buffer.from(tokenHash),
          created_at: new Date(),
          expires_at: new Date(expiresAt),
        };
        sessions.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (sql.includes('from sessions s join users u')) {
        const hash = Buffer.from(params[0]);
        const now = Date.now();
        const s = sessions.find(
          (row) => Buffer.compare(row.token_hash, hash) === 0 && row.expires_at.getTime() > now
        );
        if (!s) return { rows: [], rowCount: 0 };
        const u = users.find((usr) => usr.id === s.user_id);
        if (!u) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              session_id: s.id,
              user_id: u.id,
              email: u.email,
              avatar_url: u.avatar_url,
            },
          ],
          rowCount: 1,
        };
      }

      if (sql.startsWith('delete from sessions where token_hash')) {
        const hash = Buffer.from(params[0]);
        for (let i = sessions.length - 1; i >= 0; i -= 1) {
          if (Buffer.compare(sessions[i].token_hash, hash) === 0) {
            sessions.splice(i, 1);
          }
        }
        return { rows: [], rowCount: 1 };
      }

      if (sql.startsWith('delete from sessions where expires_at')) {
        const now = Date.now();
        for (let i = sessions.length - 1; i >= 0; i -= 1) {
          if (sessions[i].expires_at.getTime() <= now) {
            sessions.splice(i, 1);
          }
        }
        return { rows: [], rowCount: 1 };
      }

      if (sql.startsWith('select full_name, created_at from profiles where user_id')) {
        const p = profiles.find((row) => row.user_id === params[0]);
        return {
          rows: p ? [{ full_name: p.full_name, created_at: p.created_at }] : [],
          rowCount: p ? 1 : 0,
        };
      }

      if (sql.startsWith('select 1 from profiles where user_id')) {
        const p = profiles.find((row) => row.user_id === params[0]);
        return { rows: p ? [{ '?column?': 1 }] : [], rowCount: p ? 1 : 0 };
      }

      if (sql.startsWith('insert into profiles')) {
        const [userId, fullName, termsAcceptedAt, policyVersion, consentText, signupSource] = params;
        if (profiles.some((row) => row.user_id === userId)) {
          const err = new Error('duplicate profile');
          err.code = '23505';
          throw err;
        }
        const row = {
          user_id: userId,
          full_name: fullName,
          terms_accepted_at: new Date(termsAcceptedAt),
          policy_version: policyVersion,
          consent_text: consentText,
          signup_source: signupSource,
          created_at: new Date(),
        };
        profiles.push(row);
        return {
          rows: [{ full_name: row.full_name, created_at: row.created_at }],
          rowCount: 1,
        };
      }

      if (sql.startsWith('update profiles')) {
        throw new Error('profiles are immutable');
      }

      if (sql.startsWith('delete from users where id')) {
        const uid = params[0];
        for (let i = users.length - 1; i >= 0; i -= 1) {
          if (users[i].id === uid) users.splice(i, 1);
        }
        for (let i = profiles.length - 1; i >= 0; i -= 1) {
          if (profiles[i].user_id === uid) profiles.splice(i, 1);
        }
        for (let i = sessions.length - 1; i >= 0; i -= 1) {
          if (sessions[i].user_id === uid) sessions.splice(i, 1);
        }
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unhandled test SQL: ${sql}`);
    },
  };
}

function createConfig(releasesDir, overrides = {}) {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgres://localhost:5432/astrokid',
    SITE_ORIGIN: 'http://localhost:5173',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    RELEASES_DIR: releasesDir,
    SESSION_DAYS: 30,
    COOKIE_SECRET: 'test-cookie-secret-hex-0123456789',
    ...overrides,
  };
}

function createFakeOauthClient() {
  return {
    generateAuthUrl({ state, code_challenge }) {
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&code_challenge=${code_challenge}`;
    },
    async getToken({ code }) {
      return { tokens: { id_token: `id-token-for-${code}` } };
    },
    async verifyIdToken({ idToken }) {
      if (idToken === 'id-token-for-valid-code') {
        return {
          getPayload: () => ({
            sub: 'google-sub-1',
            email: 'PlayerOne@Example.com',
            email_verified: true,
            picture: 'https://lh3.googleusercontent.com/avatar.png',
          }),
        };
      }
      if (idToken === 'id-token-for-second-sub-same-email') {
        return {
          getPayload: () => ({
            sub: 'google-sub-2',
            email: 'playerone@example.com',
            email_verified: true,
            picture: null,
          }),
        };
      }
      throw new Error('invalid token');
    },
  };
}

function extractCookies(res) {
  const setCookie = res.headers['set-cookie'];
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const map = {};
  for (const c of list) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      map[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return map;
}

test('API auth, CSRF, profile immutability, protected download, and cascade deletion', async () => {
  const releasesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-releases-'));
  const db = createInMemoryDb();
  const config = createConfig(releasesDir);
  const app = await buildApp({ db, config, oauthClient: createFakeOauthClient() });

  try {
    // 1. Unauthenticated checks
    const unauthMe = await app.inject({ method: 'GET', url: '/api/me' });
    assert.equal(unauthMe.statusCode, 401);

    const unauthProfile = await app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: {
        fullName: 'Ahmed Mohamed Ali',
        consent: {
          acceptedAt: new Date().toISOString(),
          policyVersion: '2026-11-16',
          text: 'I agree to the Terms of Use and the Privacy Policy.',
        },
      },
    });
    assert.equal(unauthProfile.statusCode, 401);

    // 2. CSRF checks
    const badOrigin = await app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      payload: {},
    });
    assert.equal(badOrigin.statusCode, 403);

    const badContentType = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'text/plain',
      },
      payload: '',
    });
    assert.equal(badContentType.statusCode, 403);

    // 3. Google OAuth start & callback
    const startRes = await app.inject({
      method: 'GET',
      url: '/api/auth/google/start?intent=download',
    });
    assert.equal(startRes.statusCode, 302);
    const redirectLoc = new URL(startRes.headers.location);
    const state = redirectLoc.searchParams.get('state');
    const oauthCookies = extractCookies(startRes);
    assert.ok(oauthCookies.ak_oauth);

    const cbRes = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=valid-code&state=${state}`,
      cookies: { ak_oauth: oauthCookies.ak_oauth },
    });
    assert.equal(cbRes.statusCode, 302);
    assert.equal(cbRes.headers.location, 'http://localhost:5173/?auth=done');
    const sessionCookies = extractCookies(cbRes);
    assert.ok(sessionCookies.ak_session);
    assert.equal(db.users.length, 1);

    // Verify legacy ?intent=demo normalizes to 'download' and duplicate lower(email) fails -> ?auth=error
    const startDup = await app.inject({
      method: 'GET',
      url: '/api/auth/google/start?intent=demo',
    });
    const dupState = new URL(startDup.headers.location).searchParams.get('state');
    const dupCookies = extractCookies(startDup);
    const decodedOauth = decodeURIComponent(dupCookies.ak_oauth);
    const oauthPayload = JSON.parse(decodedOauth.slice(0, decodedOauth.lastIndexOf('.')));
    assert.equal(oauthPayload.intent, 'download');
    const dupCb = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=second-sub-same-email&state=${dupState}`,
      cookies: { ak_oauth: dupCookies.ak_oauth },
    });
    assert.equal(dupCb.statusCode, 302);
    assert.equal(dupCb.headers.location, 'http://localhost:5173/?auth=error');

    // 4. Signed-in user without profile -> /api/me returns profile: null, /api/download -> 403
    const meBefore = await app.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { ak_session: sessionCookies.ak_session },
    });
    assert.equal(meBefore.statusCode, 200);
    assert.deepEqual(meBefore.json(), {
      user: {
        email: 'PlayerOne@Example.com',
        avatarUrl: 'https://lh3.googleusercontent.com/avatar.png',
      },
      profile: null,
    });

    const dlNoProfile = await app.inject({
      method: 'GET',
      url: '/api/download',
      cookies: { ak_session: sessionCookies.ak_session },
    });
    assert.equal(dlNoProfile.statusCode, 403);

    // 5. Create profile: 2-name fails 400, 3-name succeeds 201, repeat fails 409
    const twoNameRes = await app.inject({
      method: 'POST',
      url: '/api/profile',
      cookies: { ak_session: sessionCookies.ak_session },
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: {
        fullName: 'Ahmed Ali',
        consent: {
          acceptedAt: new Date().toISOString(),
          policyVersion: '2026-11-16',
          text: 'I agree to the Terms of Use and the Privacy Policy.',
        },
      },
    });
    assert.equal(twoNameRes.statusCode, 400);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/profile',
      cookies: { ak_session: sessionCookies.ak_session },
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: {
        fullName: '  Ahmed   Mohamed   Ali  ',
        consent: {
          acceptedAt: new Date().toISOString(),
          policyVersion: '2026-11-16',
          text: 'I agree to the Terms of Use and the Privacy Policy.',
        },
        source: 'direct',
      },
    });
    assert.equal(createRes.statusCode, 201);
    assert.equal(createRes.json().profile.fullName, 'Ahmed Mohamed Ali');

    const dupProfileRes = await app.inject({
      method: 'POST',
      url: '/api/profile',
      cookies: { ak_session: sessionCookies.ak_session },
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: {
        fullName: 'Sara Hassan Youssef',
        consent: {
          acceptedAt: new Date().toISOString(),
          policyVersion: '2026-11-16',
          text: 'I agree to the Terms of Use and the Privacy Policy.',
        },
      },
    });
    assert.equal(dupProfileRes.statusCode, 409);

    // 6. Download checks: missing file -> 404 not_published, present file -> 200
    const missingHeadDl = await app.inject({
      method: 'HEAD',
      url: '/api/download',
      cookies: { ak_session: sessionCookies.ak_session },
    });
    assert.equal(missingHeadDl.statusCode, 404);

    const missingDl = await app.inject({
      method: 'GET',
      url: '/api/download',
      cookies: { ak_session: sessionCookies.ak_session },
    });
    assert.equal(missingDl.statusCode, 404);
    assert.deepEqual(missingDl.json(), { error: 'not_published' });

    const installerPath = path.join(releasesDir, 'AstroKid-Setup.exe');
    fs.writeFileSync(installerPath, 'MZ-FAKE-INSTALLER');

    const okHeadDl = await app.inject({
      method: 'HEAD',
      url: '/api/download',
      cookies: { ak_session: sessionCookies.ak_session },
    });
    assert.equal(okHeadDl.statusCode, 200);
    assert.equal(okHeadDl.body, '');

    const okDl = await app.inject({
      method: 'GET',
      url: '/api/download',
      cookies: { ak_session: sessionCookies.ak_session },
    });
    assert.equal(okDl.statusCode, 200);
    assert.match(okDl.headers['content-disposition'], /AstroKid-Setup\.exe/);
    assert.equal(okDl.body, 'MZ-FAKE-INSTALLER');

    // Also test production X-Accel-Redirect header
    const prodApp = await buildApp({
      db,
      config: createConfig(releasesDir, { NODE_ENV: 'production' }),
      oauthClient: createFakeOauthClient(),
    });
    const prodDl = await prodApp.inject({
      method: 'GET',
      url: '/api/download',
      cookies: { ak_session: sessionCookies.ak_session },
    });
    assert.equal(prodDl.statusCode, 200);
    assert.equal(prodDl.headers['x-accel-redirect'], '/_protected/AstroKid-Setup.exe');
    await prodApp.close();

    // 7. Delete account cascades users, profiles, sessions -> 204
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/api/account',
      cookies: { ak_session: sessionCookies.ak_session },
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: {},
    });
    assert.equal(delRes.statusCode, 204);
    assert.equal(db.users.length, 0);
    assert.equal(db.profiles.length, 0);
    assert.equal(db.sessions.length, 0);

    const afterDelMe = await app.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { ak_session: sessionCookies.ak_session },
    });
    assert.equal(afterDelMe.statusCode, 401);
  } finally {
    await app.close();
    fs.rmSync(releasesDir, { recursive: true, force: true });
  }
});

test('PostgreSQL 0001_init.sql schema includes immutability trigger and lower(email) unique index', () => {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations/0001_init.sql'),
    'utf8'
  );
  assert.match(sql, /create unique index users_email_lower_key on users \(lower\(email\)\)/i);
  assert.match(sql, /create trigger profiles_no_update before update on profiles/i);
  assert.match(sql, /check \(btrim\(full_name\) ~ '\^\\S\{2,\}\(\\s\+\\S\{2,\}\)\{2,\}\$' and char_length\(full_name\) <= 120\)/i);
});

test('loadConfig crashes fast on missing required environment variables', () => {
  assert.throws(
    () => loadConfig({}),
    /Invalid server environment configuration/
  );
});

test('GET /api/release reports unpublished when manifest or installer is missing, and returns metadata when published', async () => {
  const releasesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-release-test-'));
  const app = await buildApp({
    db: createInMemoryDb(),
    config: createConfig(releasesDir),
    oauthClient: { async verifyIdToken() { return {}; } },
  });

  try {
    // Neither release.json nor AstroKid-Setup.exe exists yet
    const emptyRes = await app.inject({ method: 'GET', url: '/api/release' });
    assert.equal(emptyRes.statusCode, 200);
    assert.equal(emptyRes.headers['cache-control'], 'public, max-age=60');
    assert.deepEqual(emptyRes.json(), { published: false });

    // Only AstroKid-Setup.exe exists (missing release.json)
    const installerPath = path.join(releasesDir, 'AstroKid-Setup.exe');
    const installerBytes = Buffer.from('MZ-ASTROKID-TEST-PAYLOAD');
    fs.writeFileSync(installerPath, installerBytes);
    const exeOnlyRes = await app.inject({ method: 'GET', url: '/api/release' });
    assert.equal(exeOnlyRes.statusCode, 200);
    assert.deepEqual(exeOnlyRes.json(), { published: false });

    // Invalid release.json returns published: false without leaking errors
    const manifestPath = path.join(releasesDir, 'release.json');
    fs.writeFileSync(manifestPath, '{ invalid json');
    const corruptRes = await app.inject({ method: 'GET', url: '/api/release' });
    assert.equal(corruptRes.statusCode, 200);
    assert.deepEqual(corruptRes.json(), { published: false });

    // Valid release.json + AstroKid-Setup.exe returns full metadata (upper-case sha256 normalized)
    const shaHexUpper = 'A'.repeat(64);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        version: '1.2.3',
        releasedAt: '2026-11-16',
        sha256: shaHexUpper,
      })
    );
    const pubRes = await app.inject({ method: 'GET', url: '/api/release' });
    assert.equal(pubRes.statusCode, 200);
    assert.equal(pubRes.headers['cache-control'], 'public, max-age=60');
    assert.deepEqual(pubRes.json(), {
      published: true,
      version: '1.2.3',
      releasedAt: '2026-11-16',
      sizeBytes: installerBytes.length,
      sha256: shaHexUpper.toLowerCase(),
      filename: 'AstroKid-Setup.exe',
      platform: 'Windows 10 / 11 (64-bit)',
    });

    // Missing AstroKid-Setup.exe even with valid release.json -> published: false
    fs.unlinkSync(installerPath);
    const manifestOnlyRes = await app.inject({ method: 'GET', url: '/api/release' });
    assert.equal(manifestOnlyRes.statusCode, 200);
    assert.deepEqual(manifestOnlyRes.json(), { published: false });
  } finally {
    await app.close();
    fs.rmSync(releasesDir, { recursive: true, force: true });
  }
});

test('DELETE /api/account enforces auth/CSRF, clears rows & cookie, and invokes marketing stub safely', async () => {
  const releasesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-delete-test-'));
  const db = createInMemoryDb();
  const calls = [];
  let shouldThrow = false;

  const marketing = {
    async removeFromMarketingList(email) {
      calls.push(email);
      if (shouldThrow) {
        throw new Error('simulated esp failure');
      }
    },
  };

  const app = await buildApp({
    db,
    config: createConfig(releasesDir),
    oauthClient: createFakeOauthClient(),
    marketing,
  });

  const signInAndCreateProfile = async () => {
    const startRes = await app.inject({
      method: 'GET',
      url: '/api/auth/google/start?intent=demo',
    });
    const state = new URL(startRes.headers.location).searchParams.get('state');
    const oauthCookies = extractCookies(startRes);
    const cbRes = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=valid-code&state=${state}`,
      cookies: { ak_oauth: oauthCookies.ak_oauth },
    });
    const sessionCookies = extractCookies(cbRes);
    await app.inject({
      method: 'POST',
      url: '/api/profile',
      cookies: { ak_session: sessionCookies.ak_session },
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: {
        fullName: 'Ahmed Mohamed Ali',
        consent: {
          acceptedAt: new Date().toISOString(),
          policyVersion: '2026-11-16',
          text: 'I agree to the Terms of Use and the Privacy Policy.',
        },
      },
    });
    return sessionCookies.ak_session;
  };

  try {
    // 1. Without session -> 401
    const unauthDel = await app.inject({
      method: 'DELETE',
      url: '/api/account',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: {},
    });
    assert.equal(unauthDel.statusCode, 401);
    assert.equal(calls.length, 0);

    // 2. Wrong Origin -> 403
    const badOriginDel = await app.inject({
      method: 'DELETE',
      url: '/api/account',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      payload: {},
    });
    assert.equal(badOriginDel.statusCode, 403);
    assert.equal(calls.length, 0);

    // 3. Success deletes rows, clears cookie, and calls marketing hook once with email
    const akSession1 = await signInAndCreateProfile();
    assert.equal(db.users.length, 1);
    assert.equal(db.profiles.length, 1);
    assert.equal(db.sessions.length, 1);

    const okDel = await app.inject({
      method: 'DELETE',
      url: '/api/account',
      cookies: { ak_session: akSession1 },
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: {},
    });
    assert.equal(okDel.statusCode, 204);
    assert.deepEqual(calls, ['PlayerOne@Example.com']);
    assert.equal(db.users.length, 0);
    assert.equal(db.profiles.length, 0);
    assert.equal(db.sessions.length, 0);
    const setCookieHeader = String(okDel.headers['set-cookie'] || '');
    assert.match(setCookieHeader, /ak_session=;/);

    // 4. Exception thrown by marketing hook never fails deletion
    const akSession2 = await signInAndCreateProfile();
    shouldThrow = true;
    const resilientDel = await app.inject({
      method: 'DELETE',
      url: '/api/account',
      cookies: { ak_session: akSession2 },
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: {},
    });
    assert.equal(resilientDel.statusCode, 204);
    assert.equal(calls.length, 2);
    assert.equal(db.users.length, 0);
    assert.equal(db.profiles.length, 0);
    assert.equal(db.sessions.length, 0);
  } finally {
    await app.close();
    fs.rmSync(releasesDir, { recursive: true, force: true });
  }
});

test('removeFromMarketingList logs hashed email without leaking plain email', async () => {
  const logged = [];
  await removeFromMarketingList('SecretChild@Example.com', {
    info(obj, msg) {
      logged.push({ obj, msg });
    },
  });
  assert.equal(logged.length, 1);
  assert.equal(logged[0].msg, 'marketing.remove');
  assert.equal(logged[0].obj.event, 'marketing.remove');
  assert.match(logged[0].obj.emailHash, /^[a-f0-9]{16}$/);
  assert.equal(JSON.stringify(logged).toLowerCase().includes('secretchild'), false);
});
