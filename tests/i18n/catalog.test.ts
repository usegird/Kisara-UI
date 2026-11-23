import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  flattenCatalog,
  isPluralForms,
  splitPlaceholders,
  type CatalogEntry,
} from '@/i18n/catalog-shape';
import { LOCALES, SOURCE_LOCALE } from '@/i18n/locales';

const DIR = join(import.meta.dirname, '../../src/i18n/locales');

function read(code: string): Map<string, CatalogEntry> {
  return flattenCatalog(JSON.parse(readFileSync(join(DIR, `${code}.json`), 'utf8')));
}

const source = read(SOURCE_LOCALE);

function placeholdersOf(entry: CatalogEntry): string[] {
  const texts = typeof entry === 'string' ? [entry] : Object.values(entry);
  const names = texts.flatMap((text) => splitPlaceholders(text).filter((_, at) => at % 2 === 1));
  return [...new Set(names)].sort();
}

describe('文言の表', () => {
  it('言語一覧と表のファイルが一対一', () => {
    const files = readdirSync(DIR).map((name) => name.replace(/\.json$/, ''));
    expect(files.sort()).toEqual(LOCALES.map((locale) => locale.code).sort());
  });

  describe.each(LOCALES.map((locale) => locale.code))('%s', (code) => {
    const own = read(code);
    const categories = new Set<string>(
      new Intl.PluralRules(code).resolvedOptions().pluralCategories,
    );

    it('英語に無い項目を持たない', () => {
      expect([...own.keys()].filter((key) => !source.has(key))).toEqual([]);
    });

    it('項目の種類（文字列か数の言い分けか）が英語と同じ', () => {
      const differs = [...own].filter(
        ([key, entry]) => isPluralForms(entry) !== isPluralForms(source.get(key)),
      );
      expect(differs.map(([key]) => key)).toEqual([]);
    });

    it('差し込みの印の組が英語と同じ', () => {
      const differs = [...own].filter(([key, entry]) => {
        const expected = placeholdersOf(source.get(key) ?? '');
        return placeholdersOf(entry).join() !== expected.join();
      });
      expect(differs.map(([key]) => key)).toEqual([]);
    });

    it('数の分類はその言語で使えるものだけ', () => {
      const unknown = [...own].flatMap(([key, entry]) =>
        isPluralForms(entry)
          ? Object.keys(entry)
              .filter((category) => !categories.has(category))
              .map((category) => `${key}.${category}`)
          : [],
      );
      expect(unknown).toEqual([]);
    });
  });
});
