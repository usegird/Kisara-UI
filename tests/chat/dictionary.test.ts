import { describe, expect, it } from 'vitest';

import { parseDictionary, parseKeyList, sameEntries } from '@/chat/dictionary';
import { readDictionaryFile } from '@/chat/dictionary-file';
import {
  loreDepthOf,
  loreLogicOf,
  loreProbabilityOf,
  loreRole,
  parseCardBook,
  worldInfoJson,
} from '@/chat/world-info';

import { loreEntry } from '../helpers/llm';

function entriesOf(fileName: string, content: string) {
  const read = readDictionaryFile(fileName, content);
  return read.kind === 'ok' ? read.entries : [];
}

describe('World Info の JSON', () => {
  const worldInfo = (entries: unknown, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ entries, ...extra });

  it('id を鍵にした表を読み、欄を項目の持ち物に移す', () => {
    const [before, depth, off] = entriesOf(
      'lore.json',
      worldInfo({
        0: {
          key: ['castle'],
          keysecondary: ['gate'],
          content: 'A castle.',
          position: 0,
          order: 5,
          caseSensitive: true,
        },
        1: { key: ['sea'], content: 'Sea.', position: 4, depth: 2, role: 1, scanDepth: 3 },
        2: { key: ['x'], content: 'Off.', disable: true, position: 1 },
      }),
    );
    expect(before).toMatchObject({
      keys: ['castle'],
      secondaryKeys: ['gate'],
      side: 'before',
      order: 5,
      caseSensitive: true,
    });
    expect(depth).toMatchObject({ depth: { depth: 2, role: 'user' }, scanDepth: 3 });
    expect(off).toMatchObject({ enabled: false, side: 'after', depth: null });
  });

  it('selectiveLogic を論理に、probability を発動率に、vectorized を RAG に移す', () => {
    const [nand, rare, unused] = entriesOf(
      'lore.json',
      worldInfo([
        { key: ['a'], content: 'A.', selectiveLogic: 1 },
        {
          key: ['b'],
          content: 'B.',
          selectiveLogic: 3,
          probability: 25,
          useProbability: true,
          vectorized: true,
        },
        { key: ['c'], content: 'C.', probability: 25, useProbability: false },
      ]),
    );
    expect(nand).toMatchObject({ logic: 'nand', probability: 100 });
    expect(rare).toMatchObject({ logic: 'rag', probability: 25, secondaryKeys: [] });
    expect(unused).toMatchObject({ logic: 'or', probability: 100 });
  });

  it('selective が偽なら第 2 のキーを使わない。位置 0・4 以外は after に置く', () => {
    const [entry] = entriesOf(
      'a.json',
      worldInfo([
        { key: ['k'], keysecondary: ['s'], selective: false, content: 'C.', position: 2 },
      ]),
    );
    expect(entry).toMatchObject({ secondaryKeys: [], side: 'after' });
  });

  it('名前は name、無ければファイル名（拡張子を除く）', () => {
    const one = { 0: { key: ['k'], content: 'C.' } };
    const named = readDictionaryFile('file.json', worldInfo(one, { name: 'World' }));
    const unnamed = readDictionaryFile('path/to/My Lore.json', worldInfo(one));
    expect(named.kind === 'ok' && named.name).toBe('World');
    expect(unnamed.kind === 'ok' && unnamed.name).toBe('My Lore');
  });

  it('JSON でない・World Info の形でないものは形が合わない。本文の無い項目だけなら空', () => {
    expect(readDictionaryFile('a.json', '{').kind === 'error').toBe(true);
    expect(readDictionaryFile('a.json', '{"spec":"chara_card_v2"}')).toEqual({
      kind: 'error',
      problem: 'format',
    });
    expect(readDictionaryFile('a.json', worldInfo({ 0: { key: ['k'], content: ' ' } }))).toEqual({
      kind: 'error',
      problem: 'empty',
    });
    expect(readDictionaryFile('a.txt', 'x')).toEqual({ kind: 'error', problem: 'format' });
  });
});

describe('用語と定義の表', () => {
  it('見出しの行を読み飛ばし、3 列目の別名をキーに足す。本文は「用語: 定義」', () => {
    const [entry] = entriesOf(
      'terms.csv',
      '﻿用語,定義,別名\nぴえん,泣きそうな気持ち,ぴえんこえてぱおん/ぱおん\n',
    );
    expect(entry).toMatchObject({
      keys: ['ぴえん', 'ぴえんこえてぱおん', 'ぱおん'],
      content: 'ぴえん: 泣きそうな気持ち',
      side: 'before',
      constant: false,
    });
  });

  it('CSV の引用符の中の区切りと改行を欄として読む。TSV はタブで分ける', () => {
    const [quoted] = entriesOf('a.csv', 'a,"one, two\nthree"\n');
    expect(quoted?.content).toBe('a: one, two\nthree');
    const tsv = entriesOf('a.tsv', 'x\tX の意味\ny\tY の意味');
    expect(tsv.map((entry) => entry.keys[0])).toEqual(['x', 'y']);
  });

  it('用語か定義が空の行は捨てる', () => {
    expect(entriesOf('a.csv', ',def\nterm,\nok,fine').map((entry) => entry.comment)).toEqual([
      'ok',
    ]);
  });
});

describe('置き場の形', () => {
  it('書いた形を読み戻せる。読めない項目は外す', () => {
    const entry = loreEntry({ keys: ['k'], content: 'C.', depth: { depth: 1, role: 'assistant' } });
    const raw = JSON.parse(
      JSON.stringify({ id: 'd1', name: 'N', entries: [entry, { keys: [] }], source: 'CC BY' }),
    ) as unknown;
    const dictionary = parseDictionary(raw);
    expect(dictionary?.entries).toEqual([entry]);
    expect(dictionary).not.toHaveProperty('source');
    expect(parseDictionary({ id: 'x' })).toBeNull();
  });

  it('トリガー検索範囲は 0 以上の整数で読み、無ければ持たない', () => {
    const base = { id: 'd1', name: 'N', entries: [] };
    expect(parseDictionary({ ...base, scanDepth: 3.7 })?.scanDepth).toBe(3);
    expect(parseDictionary({ ...base, scanDepth: -1 })?.scanDepth).toBe(0);
    expect(parseDictionary(base)).not.toHaveProperty('scanDepth');
  });

  it('項目の列が同じかだけを比べる', () => {
    expect(sameEntries([loreEntry({ content: 'a' })], [loreEntry({ content: 'a' })])).toBe(true);
    expect(sameEntries([loreEntry({ content: 'a' })], [loreEntry({ content: 'b' })])).toBe(false);
  });
});

describe('位置の割り振り', () => {
  it('作者のメモの前後（2・3）は深さ 4・system に差し込み、例の前後は追加辞書の印の後ろ', () => {
    const [note, example] = entriesOf(
      'a.json',
      JSON.stringify({
        entries: [
          { key: ['k'], content: 'Note.', position: 3 },
          { key: ['k'], content: 'Example.', position: 5 },
        ],
      }),
    );
    expect(note?.depth).toEqual({ depth: 4, role: 'system' });
    expect(example).toMatchObject({ depth: null, side: 'after' });
  });
});

describe('画面で打ったキー', () => {
  it('「,」か「、」で区切り、前後の空白と空を捨てる', () => {
    expect(parseKeyList(' a, b、c ,, ')).toEqual(['a', 'b', 'c']);
    expect(parseKeyList('')).toEqual([]);
  });
});

describe('書き出し', () => {
  it('World Info の JSON に書き、取り込むと同じ項目に戻る（履歴先頭・RAG の追加条件の文も）', () => {
    const entries = [
      loreEntry({ keys: ['a'], secondaryKeys: ['b'], logic: 'nand', content: 'A.', order: 3 }),
      loreEntry({ keys: ['c'], logic: 'rag', secondaryKeys: ['宝の話のとき'], content: 'C.' }),
      loreEntry({ keys: ['d'], historyStart: true, content: 'D.', probability: 30 }),
      loreEntry({ keys: ['e'], depth: { depth: 2, role: 'user' }, side: 'after', content: 'E.' }),
    ];
    const json = worldInfoJson({ name: 'Book', entries });
    const read = readDictionaryFile('Book.json', json);
    expect(read.kind === 'ok' && read.name).toBe('Book');
    const back = read.kind === 'ok' ? read.entries : [];
    expect(back[0]).toMatchObject({ logic: 'nand', secondaryKeys: ['b'], order: 3 });
    expect(back[1]).toMatchObject({ logic: 'rag', secondaryKeys: ['宝の話のとき'] });
    expect(back[2]).toMatchObject({ historyStart: true, depth: null, probability: 30 });
    expect(back[3]).toMatchObject({ depth: { depth: 2, role: 'user' } });
  });
});

describe('SillyTavern の数値の読み方', () => {
  it('selectiveLogic と発動率を直し、知らない値は OR・いつも送る', () => {
    expect([0, 1, 2, 3, 9, 'x'].map(loreLogicOf)).toEqual(['or', 'nand', 'nor', 'and', 'or', 'or']);
    expect(loreProbabilityOf(42.6)).toBe(43);
    expect(loreProbabilityOf(150)).toBe(100);
    expect(loreProbabilityOf(30, false)).toBe(100);
    expect(loreProbabilityOf(undefined)).toBe(100);
  });

  it('位置 4 は項目の深さ（無ければ 4）、2・3 は深さ 4・system、ほかは差し込まない', () => {
    expect(loreDepthOf(4, 2, 1)).toEqual({ depth: 2, role: 'user' });
    expect(loreDepthOf(4, undefined, 'assistant')).toEqual({ depth: 4, role: 'assistant' });
    expect(loreDepthOf(3, 9, 2)).toEqual({ depth: 4, role: 'system' });
    expect(loreDepthOf(1, 2, 1)).toBeNull();
    expect(loreRole('nope')).toBe('system');
  });

  it('カードのロアブックの項目を読み、拡張の位置が無ければ before_char を前とする', () => {
    const [before, depth] = parseCardBook({
      entries: [
        { keys: ['a'], content: 'A', position: 'before_char', insertion_order: 5 },
        { keys: ['b'], content: 'B', name: 'Bee', extensions: { position: 4, depth: 1 } },
        'not an entry',
      ],
    });
    expect(before).toMatchObject({ side: 'before', depth: null, order: 5, priority: 5 });
    expect(depth).toMatchObject({ side: 'after', depth: { depth: 1, role: 'system' } });
    expect(depth?.comment).toBe('Bee');
    expect(parseCardBook(null)).toEqual([]);
  });
});
