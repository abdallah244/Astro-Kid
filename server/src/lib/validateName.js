/**
 * Validates the "full name (3 names)" rule identically to PostgreSQL's CHECK constraint:
 * - trim leading/trailing whitespace and collapse internal runs of whitespace to one space
 * - max 120 characters after normalization
 * - at least 3 space-separated tokens, every token at least 2 characters (Unicode Arabic/Latin safe)
 */
export function validateFullName(raw) {
  if (typeof raw !== 'string') {
    return { valid: false, fullName: '', wordCount: 0, totalWords: 0 };
  }

  const fullName = raw.trim().replace(/\s+/g, ' ');
  if (!fullName || fullName.length > 120) {
    return { valid: false, fullName, wordCount: 0, totalWords: 0 };
  }

  const tokens = fullName.split(' ');
  const validTokens = tokens.filter((w) => w.length >= 2);
  const allPartsAtLeastTwo = tokens.every((w) => w.length >= 2);

  return {
    valid: tokens.length >= 3 && allPartsAtLeastTwo,
    fullName,
    wordCount: Math.min(3, validTokens.length),
    totalWords: validTokens.length,
  };
}
