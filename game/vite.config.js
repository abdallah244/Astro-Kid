import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PARTIALS_DIR = resolve(__dirname, 'src/site/partials');

const PARTIAL_VARIANTS = {
  index: {
    HOME_HREF: '#top',
    LEARN_HREF: '#learn',
    MISSIONS_HREF: './about.html#missions',
    MISSIONS_ATTR: '',
    INSTALL_HREF: './download.html',
    INSTALL_ATTR: '',
    ABOUT_HREF: '#about',
  },
  about: {
    HOME_HREF: './',
    LEARN_HREF: './index.html#learn',
    MISSIONS_HREF: '#missions',
    MISSIONS_ATTR: '',
    INSTALL_HREF: './download.html',
    INSTALL_ATTR: '',
    ABOUT_HREF: '#top',
  },
  download: {
    HOME_HREF: './',
    LEARN_HREF: './index.html#learn',
    MISSIONS_HREF: './about.html#missions',
    MISSIONS_ATTR: '',
    INSTALL_HREF: './download.html',
    INSTALL_ATTR: ' aria-current="page"',
    ABOUT_HREF: './about.html',
  },
  profile: {
    HOME_HREF: './',
    LEARN_HREF: './index.html#learn',
    MISSIONS_HREF: './about.html#missions',
    MISSIONS_ATTR: '',
    INSTALL_HREF: './download.html',
    INSTALL_ATTR: '',
    ABOUT_HREF: './about.html',
  },
};

function buildDemoMetaTags() {
  const rawDate = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);
  const noticeEnabled = process.env.DEMO_NOTICE === 'false' ? 'false' : 'true';
  return `<meta name="ak-build" content="${safeDate}" />\n    <meta name="ak-demo-notice" content="${noticeEnabled}" />`;
}

function htmlPartialsPlugin() {
  return {
    name: 'astro-kid-html-partials',
    transformIndexHtml(html) {
      return html
        .replace(/<!--\s*@demo-meta\s*-->/g, () => buildDemoMetaTags())
        .replace(
          /<!--\s*@include\s+(header|footer):(\w+)\s*-->/g,
          (_, name, variant) => {
            const tpl = readFileSync(resolve(PARTIALS_DIR, `${name}.html`), 'utf8');
            const vars = PARTIAL_VARIANTS[variant] || PARTIAL_VARIANTS.index;
            return tpl.replace(/\{\{(\w+)\}\}/g, (__, key) => vars[key] ?? '');
          }
        );
    },
    configureServer(server) {
      server.watcher.add(PARTIALS_DIR);
      server.watcher.on('change', (file) => {
        if (file.startsWith(PARTIALS_DIR)) {
          server.ws.send({ type: 'full-reload' });
        }
      });
    },
  };
}

// Multi-page Vite entry points:
//   index.html    -> Marketing landing page
//   about.html    -> Full About Astro Kid page
//   download.html -> Download & install page
//   policies.html -> Privacy Policy, Terms of Use & Account Deletion Policy
//   profile.html  -> Account profile stub (hooked up in later step)
//   play.html     -> Phaser 3 browser demo (stays at site root so relative assets/ and audio/ work)
// Dev-only /components.html is intentionally excluded from rollupOptions.input so it is not shipped to dist/.
export default defineConfig({
  base: './',
  plugins: [htmlPartialsPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        policies: resolve(__dirname, 'policies.html'),
        profile: resolve(__dirname, 'profile.html'),
        about: resolve(__dirname, 'about.html'),
        download: resolve(__dirname, 'download.html'),
        play: resolve(__dirname, 'play.html'),
      },
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
