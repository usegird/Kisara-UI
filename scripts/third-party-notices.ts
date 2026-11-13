// ─────────────────────────────
// 配る物に入った依存の許諾文を集め、ビルドの出力の先頭に THIRD-PARTY-NOTICES.txt を書く。
// ─────────────────────────────

// 載せるのは**出力に実際に残った**パッケージだけ（木を揺すって消えたものは載せない）。
// CSS の @import で入るもの（フォント・Tailwind）はモジュールの一覧に出ないので、globals.css の @import から拾う。
// 許諾文のファイルが無いパッケージはビルドを止める（表記の抜けを配らないため）。

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Plugin, Rollup } from 'vite';

const FILE_NAME = 'THIRD-PARTY-NOTICES.txt';
const RULE = '-'.repeat(72);
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

/** モジュールの id から、node_modules の中のパッケージの置き場を出す（最後の node_modules を採る） */
function packageDirOf(id: string): string | null {
  const path = id.replace(/\\/g, '/').replace(/\?.*$/, '');
  const match = /^(.*\/node_modules\/)(@[^/]+\/[^/]+|[^/]+)\//.exec(path);
  return match ? `${match[1]}${match[2]}` : null;
}

/** 束ね方が足す小さなコード（`\0vite/…`・`\0rolldown/…`）の持ち主 */
function virtualOwnerOf(id: string): string | null {
  const match = /^\0(vite|rolldown)\//.exec(id);
  return match ? (match[1] ?? null) : null;
}

/**
 * パッケージ名から置き場を引く。直接の依存に無ければ vite の隣から探す（rolldown）。
 * `exports` が package.json を出さないパッケージがあるので、resolve を使わずに置き場を見る
 */
function resolvePackageDir(root: string, name: string): string {
  const modules = join(root, 'node_modules');
  const viteSiblings = dirname(realpathSync(join(modules, 'vite')));
  for (const base of [modules, viteSiblings]) {
    const dir = join(base, name);
    if (existsSync(join(dir, 'package.json'))) return realpathSync(dir);
  }
  throw new Error(`third-party-notices: ${name} の置き場が見つかりません`);
}

/** globals.css の @import のうち、パッケージを指すもの（相対の参照は除く） */
function cssImports(root: string): string[] {
  const css = readFileSync(join(root, 'src/styles/globals.css'), 'utf8');
  return [...css.matchAll(/@import\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1] ?? '')
    .filter((spec) => spec !== '' && !spec.startsWith('.'))
    .map((spec) =>
      spec.startsWith('@') ? spec.split('/').slice(0, 2) : spec.split('/').slice(0, 1),
    )
    .map((parts) => parts.join('/'));
}

interface PackageJson {
  name?: unknown;
  version?: unknown;
  license?: unknown;
  author?: unknown;
}

/** MIT の定型文。許諾文のファイルを同梱しないパッケージに、宣言どおりの文を補う */
const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** 上流のリポジトリから写した許諾文の置き場（下の SUPPLIED） */
const SUPPLIED_DIR = 'scripts/third-party-notices';

interface Supplied {
  /** `SUPPLIED_DIR` の下のフォルダ */
  readonly dir: string;
  readonly files: readonly string[];
  /** 写した上流のコミット。パッケージの `__commit.txt` と違えばビルドを止める（写し直す） */
  readonly commit?: string;
}

/**
 * 許諾文のファイルを同梱しないパッケージに、上流のリポジトリから写した物を補う。
 * onnxruntime は npm のパッケージに LICENSE も、WASM に組み込んだ他のライブラリの
 * ThirdPartyNotices.txt も入れていない（`author` も著作権者ではなく公開した個人のアカウント）。
 * 写し元: https://github.com/microsoft/onnxruntime の `commit` の LICENSE と ThirdPartyNotices.txt
 */
const SUPPLIED: Readonly<Record<string, Supplied>> = {
  'onnxruntime-web': {
    dir: 'onnxruntime',
    files: ['LICENSE', 'ThirdPartyNotices.txt'],
    commit: '8d85527a010e294a26b274749f74294b2a32cec5',
  },
  'onnxruntime-common': { dir: 'onnxruntime', files: ['LICENSE'] },
};

/** 写した許諾文。写していないパッケージは null。上流のコミットが違えば投げる */
function suppliedBodies(root: string, dir: string, name: string): string[] | null {
  if (!Object.hasOwn(SUPPLIED, name)) return null;
  const supplied = SUPPLIED[name];
  if (supplied === undefined) return null;
  const commitFile = join(dir, '__commit.txt');
  if (supplied.commit !== undefined && existsSync(commitFile)) {
    const commit = readFileSync(commitFile, 'utf8').trim();
    if (commit !== supplied.commit) {
      throw new Error(
        `third-party-notices: ${name} の上流のコミット（${commit}）が写した許諾文と違います。` +
          `${SUPPLIED_DIR}/${supplied.dir} を写し直し、SUPPLIED の commit を直してください`,
      );
    }
  }
  return supplied.files.map((file) =>
    readFileSync(join(root, SUPPLIED_DIR, supplied.dir, file), 'utf8').trim(),
  );
}

function authorOf(pkg: PackageJson): string | null {
  if (typeof pkg.author === 'string') return pkg.author;
  if (typeof pkg.author === 'object' && pkg.author !== null && 'name' in pkg.author) {
    return typeof pkg.author.name === 'string' ? pkg.author.name : null;
  }
  return null;
}

/**
 * 許諾文のファイルが無いときの補い。MIT で作者が分かるときだけ定型文に作者を添える。
 * それ以外は書きようがないのでビルドを止める
 */
function fallbackBody(pkg: PackageJson, name: string, license: string): string {
  const author = authorOf(pkg);
  if (license !== 'MIT' || author === null) {
    throw new Error(`third-party-notices: ${name} に許諾文のファイルがありません`);
  }
  return [
    '(The package ships no license file. The standard text of its declared license follows.)',
    '',
    `Copyright (c) ${author}`,
    '',
    MIT_TEXT,
  ].join('\n');
}

function notice(root: string, dir: string): { key: string; text: string } {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
  const name = typeof pkg.name === 'string' ? pkg.name : dir;
  const version = typeof pkg.version === 'string' ? pkg.version : '';
  const license = typeof pkg.license === 'string' ? pkg.license : 'UNKNOWN';
  const files = readdirSync(dir)
    .filter((file) => LICENSE_FILE.test(file))
    .sort();
  const bodies =
    files.length > 0
      ? files.map((file) => readFileSync(join(dir, file), 'utf8').trim())
      : (suppliedBodies(root, dir, name) ?? [fallbackBody(pkg, name, license)]);
  const header = `${name} ${version}\nLicense: ${license}`;
  return { key: name, text: [RULE, header, '', ...bodies].join('\n') };
}

type OutputBundle = Rollup.OutputBundle;

/** 出力に残ったモジュールの持ち主のパッケージの置き場を足す */
function collectPackageDirs(root: string, bundle: OutputBundle, dirs: Set<string>): void {
  for (const file of Object.values(bundle)) {
    if (file.type !== 'chunk') continue;
    for (const [id, module] of Object.entries(file.modules)) {
      if (module.renderedLength === 0) continue;
      const owner = virtualOwnerOf(id);
      const dir = owner ? resolvePackageDir(root, owner) : packageDirOf(id);
      if (dir) dirs.add(dir);
    }
  }
}

/**
 * 本体の束ね方に入れる物（`main`）と、Web Worker の束ね方に入れる物（`worker`）。
 * Worker は別に束ねられ、本体の出力からは中のモジュールが見えない（ファイル 1 つの asset になる）。
 * Worker は本体の書き出しより先に束ねられるので、`worker` が集めた分を `main` が一緒に書く
 */
export function thirdPartyNotices(root: string): { main: Plugin; worker: Plugin } {
  const workerDirs = new Set<string>();
  const worker: Plugin = {
    name: 'kisara:third-party-notices-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      collectPackageDirs(root, bundle, workerDirs);
    },
  };
  const main: Plugin = {
    name: 'kisara:third-party-notices',
    apply: 'build',
    generateBundle(_options, bundle) {
      const dirs = new Set<string>(workerDirs);
      collectPackageDirs(root, bundle, dirs);
      for (const name of cssImports(root)) dirs.add(resolvePackageDir(root, name));

      const notices = new Map<string, string>();
      for (const dir of dirs) {
        const { key, text } = notice(root, dir);
        notices.set(key, text);
      }
      const body = [...notices.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, text]) => text);
      const intro =
        'This software includes the following third-party software.\n' +
        'Their copyright notices and license terms are reproduced below.';
      this.emitFile({
        type: 'asset',
        fileName: FILE_NAME,
        source: [intro, ...body, RULE, ''].join('\n\n'),
      });
    },
  };
  return { main, worker };
}
