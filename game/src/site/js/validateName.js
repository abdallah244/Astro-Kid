/**
 * Validates the three-names rule identically to PostgreSQL & server/src/lib/validateName.js:
 * - trims and collapses consecutive spaces
 * - counts words with length >= 2 (up to 3 for progress pips)
 * - requires >= 3 words and every whitespace-separated word >= 2 chars, max length 120
 */
export function validateFullName(raw) {
  if (typeof raw !== 'string') {
    return { valid: false, fullName: '', pipCount: 0 };
  }

  const fullName = raw.trim().replace(/\s+/g, ' ');
  if (!fullName) {
    return { valid: false, fullName: '', pipCount: 0 };
  }

  const tokens = fullName.split(' ');
  const validTokens = tokens.filter((w) => w.length >= 2);
  const pipCount = Math.min(3, validTokens.length);
  const allAtLeastTwo = tokens.every((w) => w.length >= 2);

  return {
    valid: fullName.length <= 120 && tokens.length >= 3 && allAtLeastTwo,
    fullName,
    pipCount,
  };
}
