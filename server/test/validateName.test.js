import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFullName } from '../src/lib/validateName.js';

test('validateFullName enforces the three-names rule', () => {
  // 2 names -> fail
  assert.equal(validateFullName('Ahmed Ali').valid, false);

  // 3 names -> pass
  const ok = validateFullName('Ahmed Mohamed Ali');
  assert.equal(ok.valid, true);
  assert.equal(ok.fullName, 'Ahmed Mohamed Ali');

  // single-character first token -> fail
  assert.equal(validateFullName('A Mo Ali').valid, false);

  // extra whitespace -> pass and collapsed to single spaces
  const spaced = validateFullName('  Ahmed   Mohamed   Ali  ');
  assert.equal(spaced.valid, true);
  assert.equal(spaced.fullName, 'Ahmed Mohamed Ali');

  // Arabic 3-name string -> pass
  const ar = validateFullName('أحمد محمد علي');
  assert.equal(ar.valid, true);
  assert.equal(ar.fullName, 'أحمد محمد علي');

  // 121 chars -> fail
  const longName = `${'a'.repeat(40)} ${'b'.repeat(40)} ${'c'.repeat(39)}`;
  assert.equal(longName.length, 121);
  assert.equal(validateFullName(longName).valid, false);

  // 120 chars exact -> pass
  const exact120 = `${'a'.repeat(40)} ${'b'.repeat(40)} ${'c'.repeat(38)}`;
  assert.equal(exact120.length, 120);
  assert.equal(validateFullName(exact120).valid, true);
});
