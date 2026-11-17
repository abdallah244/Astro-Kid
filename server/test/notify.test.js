import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignupNotifier } from '../src/lib/notify.js';

test('signup notifier is disabled without a token and chat id', () => {
  let called = false;
  const n = createSignupNotifier({ fetchImpl: () => { called = true; } });
  assert.equal(n.enabled, false);
  n.signup({ total: 3 });
  assert.equal(called, false);
});

test('signup notifier sends a Telegram message with no personal data', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true };
  };
  const n = createSignupNotifier({ token: 'T', chatId: '42', fetchImpl });
  assert.equal(n.enabled, true);
  n.signup({ total: 7 });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/botT/sendMessage');
  assert.equal(calls[0].body.chat_id, '42');
  assert.match(calls[0].body.text, /new player signed up\. Total sign-ups: 7\./);
  assert.doesNotMatch(calls[0].body.text, /@/);
});

test('signup notifier never throws when Telegram fails', async () => {
  const warnings = [];
  const n = createSignupNotifier({
    token: 'T',
    chatId: '1',
    fetchImpl: async () => { throw new Error('offline'); },
    log: { warn: (o, m) => warnings.push(m) },
  });
  assert.doesNotThrow(() => n.signup({ total: 1 }));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(warnings, ['signup notification failed']);
});
