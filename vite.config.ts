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

/** 開発時の接続先。実行は必ず画面操作から（GPU を消費するので、人の確認を経る） */
const COMFY_DEV_TARGET = 'http://127.0.0.1:8188';

/**
 * 計測用ビルド。本番ビルドに React の計測を残し、関数名を縮めずに残す。
 * 通常の本番ビルドと混ざらないよう、出力先を分ける
 */
const PROFILING_MODE = 'profiling';

/**
 * React Compiler を掛けるファイル。部品とフックの置き場
 */
const COMPILED_SOURCES = /[\\/]src[\\/](?:components|hooks|demo)[\\/].*\.tsx?$/;

/**
 * 公開用のデモ。`demo.html` だけを別の出力先へ出す。
 * 本体のビルドにはデモの入口も埋め込みのデータも入らない
 */
const DEMO_MODE = 'demo';

/**
 * ゲートウェイ。ゲートウェイのページの 2 つの入口だけを別の出力先へ出す（別のオリジンで配る）。
 * 本体のビルドには入らず、本体のページもこの出力に入らない
 */
const GATEWAY_MODE = 'gateway';

/**
 * 診断ファイルに書くアプリの版とビルドのコミット。利用者の入力ではないので
 * ビルド時に決めてよい。Git が無い所でビルドしたらコミットは null
 */
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

/**
 * デモのビルドで使わない部品と通信の口の差し替え先。本体の部品は変えず、
 * デモが props で外している物と、送る処理をビルドから落とす
 */
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

/** デモは常に英語なので、英語以外の訳の表を空にする（読まれることはない） */
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

/**
 * デモを置く場所でだけ要る物。入口は出力で `index.html` に名前を変える（ソースの `index.html` は
 * 本体の入口）。リンクのプレビューは絶対 URL で書く（Open Graph は相対の URL を読まない）。
 * 見本の JSON は埋め込みと同じファイルを出す（二重に持たない）
 */
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

/**
 * 本体の配る物に自分のコードの LICENSE（BSL 1.1）を写す。デモには付けない
 */
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
    // デモは置く場所の URL（GitHub Pages のサブパス）を問わないよう、ファイルを相対で参照する
    ...(demo ? { base: './' } : {}),
    // 置く場所でだけ使う静的ファイル（代表画像・説明書き）。本体のビルドには入れない
    ...(demo ? { publicDir: 'src/demo/public' } : {}),
    // ゲートウェイの配信のヘッダーは本体と別（本体の `_headers` をゲートウェイの出力に入れない）
    ...(gateway ? { publicDir: 'src/gateway/public' } : {}),
    // 出力に残った依存の許諾文を THIRD-PARTY-NOTICES.txt に書き、本体には LICENSE.txt も写す
    plugins: [
      react(),
      // 描き直しを省く比べ方を compiler に任せる。開発・ビルド・テストのすべてに掛ける。
      // 部品とフックの置き場だけに絞る（純関数・テストまで Babel に通すと変換が数倍遅くなる）
      babel({ include: COMPILED_SOURCES, presets: [reactCompilerPreset()] }),
      tailwindcss(),
      notices.main,
      ...(demo ? [] : [ownLicense(fileURLToPath(new URL('.', import.meta.url)))]),
      ...(demo ? [demoEnglishOnly(), demoSite(process.env.DEMO_SITE_URL)] : []),
    ],
    // Web Worker（近似判定の埋め込み）は別に束ねられる。中の依存の許諾文も本体の表に載せる
    worker: { plugins: () => [notices.worker] },
    resolve: {
      alias: [
        // 差し替えは '@' より先に当てる
        ...(demo ? demoStubAliases() : []),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        // Transformers.js は WebGPU 版の ONNX Runtime を読むが、近似判定は CPU（wasm）でしか計算しない。
        // WebGPU 版の WASM は配信先の 1 ファイルの上限（25 MiB）を超えるので、CPU だけの版に差し替える
        { find: /^onnxruntime-web\/webgpu$/, replacement: 'onnxruntime-web/wasm' },
        // 本番でも Profiler の onRender と React のトラックを動かす版に差し替える（公式の手順）
        ...(profiling ? [{ find: /^react-dom\/client$/, replacement: 'react-dom/profiling' }] : []),
      ],
    },
    // 部品名が縮むと Components のトラックと Profiler で見分けられない
    build: profiling
      ? { outDir: 'dist-profiling', rolldownOptions: { output: { keepNames: true } } }
      : demo
        ? { outDir: 'dist-demo', rolldownOptions: { input: 'demo.html' } }
        : gateway
          ? {
              outDir: 'dist-gateway',
              rolldownOptions: { input: ['gateway.html', 'gateway-entry.html'] },
            }
          : {},
    // ポートは固定する（開発の起動の設定がこの番号を前提にする）
    server: {
      port: 5173,
      strictPort: true,
      // ホットリロードは使わない（直すたびに打ちかけ・開いているダイアログが作り直されるため）。
      // 変更を見るときはページを読み込み直す
      hmr: false,
      // 開発時のみ CORS を迂回するためのプロキシ。
      // 本番はホスト済みフロントから直接 ComfyUI を叩くため、この経路は使わない。
      //
      // **WebSocket は専用の項目に `ws: true` を付けて通す**:
      // `/comfy` の項目だけでは upgrade 要求が握られたまま返らず、進捗が一切届かない
      // （実行が終わっても「実行中」のまま・進捗と時間が出ない）。
      // `/comfy/ws` を先に置くと rewrite も効き、ComfyUI の `/ws` に繋がる。
      proxy: {
        // 進捗の WebSocket。**`/comfy` より前に置く**（前方一致で先勝ち）
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
          // ComfyUI は **Origin が Host と食い違う変更系リクエストを 403 で弾く**
          // （`--enable-cors-header` を付けていないときの既定）。
          // `changeOrigin` は Host しか書き換えないので、Origin もここで合わせる
          headers: { Origin: COMFY_DEV_TARGET },
          rewrite: (path) => path.replace(/^\/comfy/, ''),
        },
      },
    },
    // テストの出力は**落ちたときだけ詳しく**出す（出力の量が文脈を食うため）。
    // 全緑のときはドットだけ、失敗したときも差分は変更箇所の周辺に絞る。
    test: {
      environment: 'node',
      // ファイルごとに作り直す画面の環境（jsdom）と前準備が全体の時間の大半なので、vm の文脈で
      // 作り直す（プロセスを使い回す）。既定の forks の 6 割ほどの時間で済む。
      // vm の文脈では `location` などを定義し直せないので、テストは差し替えられる関数を通す
      pool: 'vmForks',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      // 画面の言語を日本語に決めてから読む
      setupFiles: [
        'tests/setup/locale.ts',
        'tests/setup/tab-ui.ts',
        'tests/setup/comfy-port.ts',
        'tests/setup/async-wait.ts',
        'tests/setup/web-locks.ts',
        'tests/setup/web-streams.ts',
      ],
      // 画面が出るのを待つ上限（10 秒。tests/setup/async-wait.ts）より長くする。
      // 短いと、並べて走らせたときに待ちきる前にテストごと打ち切られる
      testTimeout: 15_000,
      // 成功したファイルは1文字。ファイル一覧を毎回出さない
      reporters: ['dot'],
      // 通ったテストの console 出力は捨てる（落ちたテストのものは残る）
      silent: 'passed-only',
      // 差分は変更箇所の周辺だけ・長すぎるものは打ち切る
      diff: { expand: false, truncateThreshold: 40, printBasicPrototype: false },
      // 漏れの退行テストが GC を強制できるように
      execArgv: ['--expose-gc'],
    },
  };
});
