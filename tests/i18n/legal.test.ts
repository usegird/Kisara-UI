import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { legal } from '@/i18n';
import { LOCALES } from '@/i18n/locales';

const DIR = join(import.meta.dirname, '../../legal');
const DOCUMENTS = ['terms', 'privacy'] as const;

describe('規約とポリシーの本文', () => {
  it('言語一覧と本文のフォルダが一対一', () => {
    const folders = readdirSync(DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(folders.sort()).toEqual(LOCALES.map((locale) => locale.code).sort());
  });

  describe.each(LOCALES.map((locale) => locale.code))('%s', (code) => {
    it.each(DOCUMENTS)('%s の本文があり、空行で段落に分かれる', (document) => {
      const path = join(DIR, code, `${document}.txt`);
      expect(existsSync(path)).toBe(true);
      const text = readFileSync(path, 'utf8');
      expect(text.length).toBeGreaterThan(1000);
      expect(text).toContain('\n\n');
      expect(text).not.toContain('\r');
    });
  });

  it('描く前に読み終え、今の言語（テストは日本語）で引ける', () => {
    expect(legal('terms')).toMatch(/^第1条/);
    expect(legal('privacy')).toMatch(/^1\. /);
  });
});
