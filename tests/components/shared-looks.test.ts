import { afterEach, describe, expect, it, vi } from 'vitest';

import { CARD_MOTION, CHIP_MOTION, motionOf } from '@/components/comfy/flow/item-motion';
import { bottomGapOf, isNearBottom } from '@/components/llm/message/log-scroll';
import { FIELD_XS } from '@/components/ui/field';
import { SMALL_ICON_BUTTON, smallButton } from '@/components/ui/small-button';
import { sortableStyle } from '@/components/ui/sortable-style';
import {
  TOAST_TIMEOUT,
  toastError,
  toastManager,
  toastSuccess,
} from '@/components/ui/toast-manager';
import { entryKeyOf } from '@/lib/text-entry';

const BUTTON = 'hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('小さいボタンと欄のクラス', () => {
  it('枠付きの文字のボタンは、淡くするかどうかだけが末尾に付く', () => {
    expect(smallButton()).toBe(BUTTON);
    expect(smallButton({ fade: true })).toBe(`${BUTTON} disabled:opacity-40`);
    expect(SMALL_ICON_BUTTON).toBe('hover:bg-muted rounded p-0.5 disabled:opacity-40');
  });

  it('小さい文字の欄は入力欄の対応表の xs と同じ', () => {
    expect(FIELD_XS).toBe('border-input bg-background rounded-md border px-2 py-1 text-xs');
  });
});

describe('並びの 1 つの動き', () => {
  it('抜けるほうを先に見て、どちらでもなければ動かさない', () => {
    expect(motionOf(true, true)).toBe('leave');
    expect(motionOf(false, true)).toBe('enter');
    expect(motionOf(false, false)).toBe('none');
  });

  it('カードとチップは同じ種類で、クラスの名前だけが違う', () => {
    expect(Object.keys(CHIP_MOTION)).toEqual(Object.keys(CARD_MOTION));
    expect(CARD_MOTION.enter).toBe('kisara-card-enter');
    expect(CHIP_MOTION.leave).toBe('kisara-chip-leave');
  });
});

describe('並べ替えの項目の style', () => {
  it('位置だけを動かし、戻りの動きはそのまま渡す', () => {
    const style = sortableStyle({ x: 3, y: 4, scaleX: 2, scaleY: 2 }, 'transform 200ms ease');
    expect(style).toEqual({
      transform: 'translate3d(3px, 4px, 0)',
      transition: 'transform 200ms ease',
    });
    expect(sortableStyle(null, undefined).transform).toBeUndefined();
  });
});

describe('欄の確定・取り消しのキー', () => {
  const key = (name: string, composing = false, keyCode = 0) => ({
    key: name,
    keyCode,
    nativeEvent: { isComposing: composing },
  });

  it('Enter は確定・Esc は取り消し・ほかは null', () => {
    expect(entryKeyOf(key('Enter'))).toBe('commit');
    expect(entryKeyOf(key('Escape'))).toBe('cancel');
    expect(entryKeyOf(key('a'))).toBeNull();
  });

  it('変換中の Enter・Esc は拾わない（Safari はキーの番号だけで知らせる）', () => {
    expect(entryKeyOf(key('Enter', true))).toBeNull();
    expect(entryKeyOf(key('Escape', false, 229))).toBeNull();
  });
});

describe('会話のログの末尾', () => {
  const log = (scrollHeight: number, scrollTop: number, clientHeight: number) =>
    ({ scrollHeight, scrollTop, clientHeight }) as unknown as Element;

  it('下端までの送り残しを返し、24px 以内なら末尾を見ている', () => {
    expect(bottomGapOf(log(1000, 500, 400))).toBe(100);
    expect(isNearBottom(log(1000, 576, 400))).toBe(true);
    expect(isNearBottom(log(1000, 575, 400))).toBe(false);
  });
});

describe('知らせの出し口', () => {
  it('失敗は閉じるまで残し、成功はしばらくして消す。説明が無ければ説明の鍵を渡さない', () => {
    const add = vi.spyOn(toastManager, 'add').mockReturnValue('id');
    toastError('failed', 'why');
    toastSuccess('done');
    expect(add.mock.calls[0]?.[0]).toEqual({
      title: 'failed',
      description: 'why',
      type: 'error',
      timeout: TOAST_TIMEOUT.error,
    });
    expect(add.mock.calls[1]?.[0]).not.toHaveProperty('description');
    expect(add.mock.calls[1]?.[0]).toMatchObject({
      type: 'success',
      timeout: TOAST_TIMEOUT.success,
    });
  });
});
