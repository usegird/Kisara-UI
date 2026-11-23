import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

describe('出てくるときの動きの長さ', () => {
  it('animate-in と同じクラスの並びに、素の duration-* を置かない', () => {
    const offenders = sources('src').flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return [...text.matchAll(/['"`]([^'"`]*\banimate-in\b[^'"`]*)['"`]/gu)]
        .filter((match) => /(?<![\w-])duration-\d/u.test(match[1] ?? ''))
        .map(() => path);
    });
    expect(offenders).toEqual([]);
  });
});
