/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Alias, type Plugin } from 'vite';

import { thirdPartyNotices } from './scripts/third-party-notices.ts';
import { welcomePages } from './scripts/welcome-pages.ts';

const COMFY_DEV_TARGET = 'http://127.0.0.1:8188';

const PROFILING_MODE = 'profiling';

const COMPILED_SOURCES = /[\\/]src[\\/](?:components|hooks|demo)[\\/].*\.tsx?$/;

const DEMO_MODE = 'demo';

const GATEWAY_MODE = 'gateway';

const SITE_PAGES = ['index.html', 'app/index.html'];

function buildInfo(root: string): { version: string; commit: string | null } {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown };
  const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  try {
    const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root })
      .toString()
      .trim();
    return { version, commit };
  } catch {
    return { version, commit: null };
  }
}

const DEMO_STUBS: Readonly<Record<string, string>> = {
  '@/comfy/client': './src/demo/stubs/comfy-client.ts',
  '@/components/comfy/flow/InsertBar': './src/demo/stubs/InsertBar.tsx',
  '@/components/comfy/flow/dialogs/ModelPickerDialog': './src/demo/stubs/ModelPickerDialog.tsx',
  '@/components/comfy/flow/dialogs/NodeSettingsDialog': './src/demo/stubs/NodeSettingsDialog.tsx',
};

function demoStubAliases(): Alias[] {
  return Object.entries(DEMO_STUBS).map(([from, to]) => ({
    find: from,
    replacement: fileURLToPath(new URL(to, import.meta.url)),
  }));
}

function demoEnglishOnly(): Plugin {
  return {
    name: 'kisara:demo-english-only',
    enforce: 'pre',
    load(id) {
      const path = id.replaceAll('\\', '/');
      return /\/src\/i18n\/locales\/(?!en\.json$)[^/]+\.json$/.test(path) ? '{}' : null;
    },
  };
}

function demoSite(siteUrl: string | undefined): Plugin {
  if (siteUrl !== undefined && !/^https:\/\/.+\/$/.test(siteUrl)) {
    throw new Error(`DEMO_SITE_URL must be an https URL ending with "/": ${siteUrl}`);
  }
  return {
    name: 'kisara:demo-site',
    transformIndexHtml() {
      if (siteUrl === undefined) return [];
      return [
        { tag: 'meta', attrs: { property: 'og:url', content: siteUrl } },
        { tag: 'meta', attrs: { property: 'og:image', content: `${siteUrl}og-image.jpg` } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
      ];
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'sample-workflow.json',
        source: readFileSync(fileURLToPath(new URL('./src/demo/workflow.json', import.meta.url))),
      });
    },
    writeBundle(options) {
      const dir = options.dir ?? 'dist-demo';
      renameSync(join(dir, 'demo.html'), join(dir, 'index.html'));
    },
  };
}

function ownLicense(root: string): Plugin {
  return {
    name: 'kisara:own-license',
    apply: 'build',
    generateBundle() {
      const source = readFileSync(join(root, 'LICENSE'), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source });
    },
  };
}

export default defineConfig(({ mode }) => {
  const profiling = mode === PROFILING_MODE;
  const demo = mode === DEMO_MODE;
  const gateway = mode === GATEWAY_MODE;
  const notices = thirdPartyNotices(fileURLToPath(new URL('.', import.meta.url)));
  return {
    define: {
      __KISARA_BUILD__: JSON.stringify(buildInfo(fileURLToPath(new URL('.', import.meta.url)))),
    },
    ...(demo ? { base: './' } : {}),
    ...(demo ? { publicDir: 'src/demo/public' } : {}),
    ...(gateway ? { publicDir: 'src/gateway/public' } : {}),
    plugins: [
      react(),
      babel({ include: COMPILED_SOURCES, presets: [reactCompilerPreset()] }),
      tailwindcss(),
      notices.main,
      ...(demo ? [] : [ownLicense(fileURLToPath(new URL('.', import.meta.url)))]),
      ...(demo || gateway
        ? []
        : [welcomePages(fileURLToPath(new URL('.', import.meta.url)), process.env.SITE_URL)]),
      ...(demo ? [demoEnglishOnly(), demoSite(process.env.DEMO_SITE_URL)] : []),
    ],
    worker: { plugins: () => [notices.worker] },
    resolve: {
      alias: [
        ...(demo ? demoStubAliases() : []),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        { find: /^onnxruntime-web\/webgpu$/, replacement: 'onnxruntime-web/wasm' },
        ...(profiling ? [{ find: /^react-dom\/client$/, replacement: 'react-dom/profiling' }] : []),
      ],
    },
    build: profiling
      ? {
          outDir: 'dist-profiling',
          rolldownOptions: { input: SITE_PAGES, output: { keepNames: true } },
        }
      : demo
        ? { outDir: 'dist-demo', rolldownOptions: { input: 'demo.html' } }
        : gateway
          ? {
              outDir: 'dist-gateway',
              rolldownOptions: { input: ['gateway.html', 'gateway-entry.html'] },
            }
          : { rolldownOptions: { input: SITE_PAGES } },
    server: {
      port: 5173,
      strictPort: true,
      hmr: false,
      proxy: {
        '/comfy/ws': {
          target: COMFY_DEV_TARGET,
          ws: true,
          changeOrigin: true,
          headers: { Origin: COMFY_DEV_TARGET },
          rewrite: (path) => path.replace(/^\/comfy/, ''),
        },
        '/comfy': {
          target: COMFY_DEV_TARGET,
          changeOrigin: true,
          headers: { Origin: COMFY_DEV_TARGET },
          rewrite: (path) => path.replace(/^\/comfy/, ''),
        },
      },
    },
    test: {
      environment: 'node',
      pool: 'vmForks',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      setupFiles: [
        'tests/setup/locale.ts',
        'tests/setup/tab-ui.ts',
        'tests/setup/comfy-port.ts',
        'tests/setup/async-wait.ts',
        'tests/setup/web-locks.ts',
        'tests/setup/web-streams.ts',
      ],
      testTimeout: 15_000,
      reporters: ['dot'],
      silent: 'passed-only',
      diff: { expand: false, truncateThreshold: 40, printBasicPrototype: false },
      execArgv: ['--expose-gc'],
    },
  };
});
