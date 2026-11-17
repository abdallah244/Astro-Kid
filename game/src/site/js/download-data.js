/* Static structured data and release formatters for the Download & Install page. */

export const VERIFY_COMMAND = 'Get-FileHash .\\AstroKid-Setup.exe';

export const SYSTEM_REQUIREMENTS = [
  {
    spec: 'SYSTEM',
    minimum: 'Windows 10 (64-bit)',
    recommended: 'Windows 11',
  },
  {
    spec: 'MEMORY',
    minimum: '4 GB RAM',
    recommended: '8 GB RAM',
  },
  {
    spec: 'STORAGE',
    minimum: '500 MB free',
    recommended: '1 GB free',
  },
  {
    spec: 'DISPLAY',
    minimum: '1280 × 720',
    recommended: '1920 × 1080',
  },
  {
    spec: 'GRAPHICS',
    minimum: 'Any with WebGL',
    recommended: 'Dedicated GPU',
  },
];

export const DOWNLOAD_FAQS = [
  {
    id: 'faq-free',
    question: 'Is Astro Kid really free?',
    answer:
      'Yes. Downloading and playing this educational version costs nothing, now or later.',
    defaultOpen: true,
  },
  {
    id: 'faq-google',
    question: 'Why do I need to sign in with Google?',
    answer:
      'You sign in with Google and enter your three-part name to unlock the full installer, linking your download to your quick sign-in account under our Terms of Use.',
    defaultOpen: false,
  },
  {
    id: 'faq-safe',
    question: 'Is the installer safe?',
    answer:
      'Yes. AstroKid-Setup.exe is served directly from this site, and you can confirm its exact SHA-256 checksum above before running it on Windows.',
    defaultOpen: false,
  },
  {
    id: 'faq-platforms',
    question: 'Can I play on Mac, Linux or a tablet?',
    answer:
      'The full desktop installer requires Windows 10 or 11 (64-bit). On Mac, Linux or a tablet, you can still play the free browser demo right here.',
    defaultOpen: false,
  },
  {
    id: 'faq-diff',
    question: 'What is the difference between the demo and the full game?',
    answer:
      'The demo runs in your browser with nothing to install and needs no account. It is an early, unfinished version with many parts missing. The desktop game is the full version.',
    defaultOpen: false,
  },
  {
    id: 'faq-delete',
    question: 'How do I delete my account?',
    answer:
      'Sign in, open your Profile page and press "Delete account", or email abdallahhfares@gmail.com from the Google address linked to your account.',
    defaultOpen: false,
  },
];

const MONTHS_SHORT = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

export function formatReleaseSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '—';
  const mb = Math.max(1, Math.round(sizeBytes / (1024 * 1024)));
  return `~${mb} MB`;
}

export function formatReleaseDate(releasedAt) {
  if (typeof releasedAt !== 'string' || !releasedAt.trim()) return '—';
  const match = /^(\d{4})-(\d{2})/.exec(releasedAt.trim());
  if (match) {
    const year = match[1];
    const monthIndex = Number.parseInt(match[2], 10) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${MONTHS_SHORT[monthIndex]} ${year}`;
    }
  }
  const parsed = new Date(releasedAt);
  if (Number.isNaN(parsed.getTime())) return releasedAt.toUpperCase();
  return `${MONTHS_SHORT[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
}

export function formatShortSha256(sha256) {
  if (typeof sha256 !== 'string' || sha256.length < 16) return sha256 || '—';
  return `${sha256.slice(0, 6)}...${sha256.slice(-5)}`;
}

export function formatPlatformShort(platform) {
  if (typeof platform !== 'string' || !platform.trim()) return 'WIN 10 / 11';
  if (/windows/i.test(platform)) return 'WIN 10 / 11';
  return platform.toUpperCase().slice(0, 14);
}
