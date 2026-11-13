import { describe, expect, it } from 'vitest';

import {
  filterTemplates,
  sortTemplates,
  templateCategories,
  type TemplateSection,
  type WorkflowTemplate,
} from '@/graph/template-filter';

import { template } from '../helpers/template';

// ─────────────────────────────
// テンプレートの絞り込みと並び替え。
// ─────────────────────────────

const SECTIONS: TemplateSection[] = [
  {
    title: 'Use Cases',
    templates: [template('b', { tags: ['Video'] }), template('a')],
  },
  {
    title: 'Image',
    templates: [
      template('a', { usage: 10, date: '2026-01-01', size: 300 }),
      template('c', { usage: 30, date: '2026-05-01', models: ['Flux'] }),
      template('d', { usage: 20, date: '2025-12-01', size: 100 }),
    ],
  },
];

const names = (list: readonly WorkflowTemplate[]): string[] => list.map((item) => item.name);

describe('テンプレートの絞り込み', () => {
  it('カテゴリは見出しの並びと件数', () => {
    expect(templateCategories(SECTIONS).map((entry) => entry.count)).toEqual([2, 3]);
  });

  it('「すべて」は同じものを 1 つにまとめる', () => {
    expect(names(filterTemplates(SECTIONS, { category: null, query: '' }))).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });

  it('カテゴリで絞る', () => {
    expect(names(filterTemplates(SECTIONS, { category: 1, query: '' }))).toEqual(['a', 'c', 'd']);
  });

  it('タグとモデル名も文字の絞り込みに掛かる（大小を区別しない）', () => {
    expect(names(filterTemplates(SECTIONS, { category: null, query: 'video' }))).toEqual(['b']);
    expect(names(filterTemplates(SECTIONS, { category: null, query: 'FLUX' }))).toEqual(['c']);
  });
});

describe('テンプレートの並び替え', () => {
  const list = SECTIONS[1]?.templates ?? [];

  it('人気は使われた数の多い順', () => {
    expect(names(sortTemplates(list, 'popular'))).toEqual(['c', 'd', 'a']);
  });

  it('新しい順は日付の新しい順', () => {
    expect(names(sortTemplates(list, 'newest'))).toEqual(['c', 'a', 'd']);
  });

  it('モデルの小さい順は大きさが無いものを末尾に送る', () => {
    expect(names(sortTemplates(list, 'size'))).toEqual(['d', 'a', 'c']);
  });

  it('既定は並びを変えない', () => {
    expect(names(sortTemplates(list, 'default'))).toEqual(['a', 'c', 'd']);
  });
});
