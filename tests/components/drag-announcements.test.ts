import type { Active, Data, Over } from '@dnd-kit/core';
import { afterAll, describe, expect, it } from 'vitest';

import { dragAccessibility } from '@/components/ui/drag-announcements';
import { initLocale } from '@/i18n';

// 読み上げの文言は画面の言語で、識別子ではなく名前を読む

function active(id: string, data: Data): Active {
  return { id, data: { current: data }, rect: { current: { initial: null, translated: null } } };
}

function over(id: string, data: Data): Over {
  return {
    id,
    data: { current: data },
    rect: { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 },
    disabled: false,
  };
}

const { announcements, screenReaderInstructions } = dragAccessibility();
const item = active('app:3:seed', { label: 'シード' });

describe('dragAccessibility', () => {
  afterAll(() => initLocale('ja'));

  it('名前で読み、識別子を読まない', () => {
    const start = announcements.onDragStart({ active: item });
    expect(start).toContain('シード');
    expect(start).not.toContain('app:3:seed');
  });

  it('並べ替えの相手は位置、結線の相手は落とす先として読む', () => {
    const sortTarget = over('app:3:steps', { label: 'ステップ', sortable: { index: 1 } });
    const dropTarget = over('in:7:0', { label: 'モデル' });
    const sorted = announcements.onDragEnd({ active: item, over: sortTarget });
    const dropped = announcements.onDragEnd({ active: item, over: dropTarget });
    expect(sorted).toContain('ステップ');
    expect(dropped).toContain('モデル');
    expect(sorted).not.toBe(dropped);
  });

  it('名前が無ければ識別子の代わりに「項目」と読む', () => {
    const text = announcements.onDragCancel({ active: active('currentInput', {}), over: null });
    expect(text).not.toContain('currentInput');
    expect(text).toContain('項目');
  });

  it('操作の説明は描くときの言語で引く', async () => {
    await initLocale('en');
    const english = dragAccessibility().screenReaderInstructions.draggable;
    expect(english).toContain('Space');
    expect(english).not.toBe(screenReaderInstructions.draggable);
  });
});
