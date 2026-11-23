import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Plugin, Rollup } from 'vite';

const FILE_NAME = 'THIRD-PARTY-NOTICES.txt';
const RULE = '-'.repeat(72);
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

function packageDirOf(id: string): string | null {
  const path = id.replace(/\\/g, '/').replace(/\?.*$/, '');
  const match = /^(.*\/node_modules\/)(@[^/]+\/[^/]+|[^/]+)\//.exec(path);
  return match ? `${match[1]}${match[2]}` : null;
}

function virtualOwnerOf(id: string): string | null {
  const match = /^\0(vite|rolldown)\//.exec(id);
  return match ? (match[1] ?? null) : null;
}

function resolvePackageDir(root: string, name: string): string {
  const modules = join(root, 'node_modules');
  const viteSiblings = dirname(realpathSync(join(modules, 'vite')));
  for (const base of [modules, viteSiblings]) {
    const dir = join(base, name);
    if (existsSync(join(dir, 'package.json'))) return realpathSync(dir);
  }
  throw new Error(`third-party-notices: ${name} の置き場が見つかりません`);
}

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

const SUPPLIED_DIR = 'scripts/third-party-notices';

interface Supplied {
  readonly dir: string;
  readonly files: readonly string[];
  readonly commit?: string;
}

const SUPPLIED: Readonly<Record<string, Supplied>> = {
  'onnxruntime-web': {
    dir: 'onnxruntime',
    files: ['LICENSE', 'ThirdPartyNotices.txt'],
    commit: '8d85527a010e294a26b274749f74294b2a32cec5',
  },
  'onnxruntime-common': { dir: 'onnxruntime', files: ['LICENSE'] },
};

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
