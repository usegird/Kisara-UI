import { describe, expect, it } from 'vitest';

import {
  draftOf,
  expressionSetOf,
  mergeImported,
  removeItem,
  renameItem,
  setDefault,
} from '@/components/llm/dialogs/expression-draft';

const image = (text: string): Blob => new Blob([text], { type: 'image/png' });

const base = draftOf({
  defaultLabel: 'neutral',
  items: [
    { label: 'neutral', image: image('n') },
    { label: 'joy', image: image('j') },
  ],
});
const idOf = (label: string): string => base.items.find((item) => item.label === label)?.id ?? '';

describe('ラベル', () => {
  it('空・40 字を超える・ほかと同じなら理由を返し、決めたら直した印を付ける', () => {
    expect(renameItem(base, idOf('joy'), '  ')).toBe('empty');
    expect(renameItem(base, idOf('joy'), 'x'.repeat(41))).toBe('tooLong');
    expect(renameItem(base, idOf('joy'), ' neutral ')).toBe('duplicate');
    const next = renameItem(base, idOf('joy'), ' smile ');
    if (typeof next === 'string') throw new Error(next);
    expect(next.dirty).toBe(true);
    expect(expressionSetOf(next).items.map((item) => item.label)).toEqual(['neutral', 'smile']);
  });
});

describe('既定', () => {
  it('既定の表情は消せず、既定を替えると保存の既定のラベルも替わる', () => {
    expect(removeItem(base, idOf('neutral'))).toBe(base);
    const next = setDefault(base, idOf('joy'));
    expect(expressionSetOf(next).defaultLabel).toBe('joy');
    expect(removeItem(next, idOf('neutral')).items.map((item) => item.label)).toEqual(['joy']);
  });
});

describe('取り込み', () => {
  it('同じラベルは画像を差し替え、新しいラベルは末尾に足し、足した最後を選ぶ', () => {
    const replacement = image('j2');
    const merged = mergeImported(base, [
      { label: 'joy', image: replacement },
      { label: 'sad', image: image('s') },
    ]);
    expect([merged.added, merged.replaced]).toEqual([1, 1]);
    expect(merged.draft.items.map((item) => item.label)).toEqual(['neutral', 'joy', 'sad']);
    expect(merged.draft.items[1]?.image).toBe(replacement);
    const picked = merged.draft.items.find((item) => item.id === merged.draft.selectedId);
    expect(picked?.label).toBe('sad');
  });
});
