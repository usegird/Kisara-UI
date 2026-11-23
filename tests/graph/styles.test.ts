import { describe, expect, it } from 'vitest';

import {
  findStyle,
  mergeStyles,
  parseStyleFile,
  parseStyleTable,
  removeStyle,
  serializeStyleFile,
  upsertStyle,
  type SavedStyle,
  type Style,
} from '@/graph/styles';

const SAMPLE =
  '﻿name,prompt,negative_prompt\r\n' +
  'anima,"masterpiece, best quality,\n<lora:anima:0.9>,\n",\r\n' +
  'anima2,"1girl, solo2,\n{ || ** ""#},; ",bad hands\r\n';

function style(overrides: Partial<Style> = {}): Style {
  return { name: 'a', prompt: 'p', negative: 'n', other: {}, ...overrides };
}

function names(text: string): string[] {
  return parseStyleTable(text).styles.map((entry) => entry.name);
}

describe('styles.csv の読み', () => {
  const table = parseStyleTable(SAMPLE);

  it('名前・肯定・否定を取り出す', () => {
    expect(table.styles.map((entry) => entry.name)).toEqual(['anima', 'anima2']);
    expect(table.styles[0]?.prompt).toContain('<lora:anima:0.9>');
    expect(table.styles[1]?.negative).toBe('bad hands');
  });

  it('見出しの表記が揺れても引き当てる', () => {
    const other = parseStyleTable('Name,Prompt,Negative Prompt\r\na,p,n\r\n');

    expect(other.styles[0]).toEqual({ name: 'a', prompt: 'p', negative: 'n', other: {} });
  });

  it('知らない列は名前のまま持つ', () => {
    const other = parseStyleTable('name,prompt,negative_prompt,note\r\na,p,n,memo\r\n');

    expect(other.styles[0]?.other).toEqual({ note: 'memo' });
  });

  it('名前の列が無い・名前が空の行は untitled にする', () => {
    expect(names('a,b\r\n1,2\r\n3,4\r\n')).toEqual(['untitled', 'untitled 2']);
  });

  it('大文字小文字を問わず重なる名前は、後の行に空いている枝番を付ける', () => {
    expect(names('name\r\nAnime\r\nanime 2\r\nanime\r\n')).toEqual(['Anime', 'anime 2', 'anime 3']);
  });

  it('中身がすべて空の行は読まず、重なる見出しの列は枝番を付けて持つ', () => {
    const other = parseStyleTable('name,note,note\r\n,,\r\na,x,y\r\n');

    expect(other.styles).toHaveLength(1);
    expect(other.styles[0]?.other).toEqual({ note: 'x', 'note 2': 'y' });
  });
});

describe('kisara/ の 1 件', () => {
  it('書いて読むと同じ 1 件に戻り、ほかの列が無ければ other を書かない', () => {
    const entry: SavedStyle = { deleted: false, style: style({ other: { note: 'm' } }) };

    expect(parseStyleFile(JSON.parse(serializeStyleFile(entry)))).toEqual(entry);
    expect(serializeStyleFile({ deleted: false, style: style() })).not.toContain('other');
  });

  it('消した印は名前だけを持ち、形の合わないものは無いものとして扱う', () => {
    const mark: unknown = JSON.parse(serializeStyleFile({ deleted: true, name: 'a' }));

    expect(parseStyleFile(mark)).toEqual({ deleted: true, name: 'a' });
    expect(parseStyleFile({ v: 1, name: 'a' })).toBeNull();
    expect(parseStyleFile({ v: 2, name: 'a', prompt: '', negative: '' })).toBeNull();
  });
});

describe('合わせ方', () => {
  const csv = parseStyleTable('name,prompt\r\nb,csv\r\nAnime,csv\r\ngone,csv\r\n');
  const saved: SavedStyle[] = [
    { deleted: false, style: style({ name: 'anime', prompt: 'kisara' }) },
    { deleted: true, name: 'GONE' },
    { deleted: false, style: style({ name: 'z' }) },
    { deleted: false, style: style({ name: 'c' }) },
  ];

  it('同じ名前は大文字小文字を問わず kisara/ を優先し、消した印なら外す', () => {
    const merged = mergeStyles(csv, saved);

    expect(findStyle(merged, 'anime')?.prompt).toBe('kisara');
    expect(findStyle(merged, 'Anime')).toBeNull();
    expect(merged.styles.some((entry) => entry.name.toLowerCase() === 'gone')).toBe(false);
  });

  it('styles.csv の順の後ろに、kisara/ だけの名前を名前順に並べる', () => {
    const merged = mergeStyles(csv, saved).styles.map((entry) => entry.name);

    expect(merged).toEqual(['b', 'anime', 'c', 'z']);
  });
});

describe('書き入れ', () => {
  const table = parseStyleTable(SAMPLE);

  it('名前が同じものは差し替える', () => {
    const result = upsertStyle(table, 'anima', style({ name: 'anima', prompt: 'new' }));

    expect(result.table?.styles).toHaveLength(2);
    expect(findStyle(result.table ?? table, 'anima')?.prompt).toBe('new');
  });

  it('元が無ければ末尾に足す', () => {
    const result = upsertStyle(table, null, style({ name: 'added' }));

    expect(result.table?.styles.map((entry) => entry.name)).toEqual(['anima', 'anima2', 'added']);
  });

  it('名前が空・他と重なる（大文字小文字を問わない）ときは書かない', () => {
    expect(upsertStyle(table, null, style({ name: '  ' })).error).toBe('empty-name');
    expect(upsertStyle(table, null, style({ name: 'anima' })).error).toBe('duplicate-name');
    expect(upsertStyle(table, null, style({ name: 'ANIMA' })).error).toBe('duplicate-name');
    expect(upsertStyle(table, 'anima', style({ name: 'Anima' })).error).toBeNull();
  });

  it('消すとその行だけ落ちる', () => {
    expect(removeStyle(table, 'anima').styles.map((entry) => entry.name)).toEqual(['anima2']);
  });
});
