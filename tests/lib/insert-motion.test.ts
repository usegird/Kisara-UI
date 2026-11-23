// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { playInsertMotion } from '@/lib/insert-motion';

function stubAnimate(): { readonly animated: Element[]; readonly finish: () => Promise<void> } {
  const animated: Element[] = [];
  const endings: (() => void)[] = [];
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (this: Element) {
      animated.push(this);
      const finished = new Promise<void>((resolve) => endings.push(resolve));
      return { finished } as unknown as Animation;
    },
  });
  return {
    animated,
    finish: async () => {
      for (const end of endings) end();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

function fieldWith(value: string): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  field.value = value;
  document.body.append(field);
  return field;
}

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('入れた文字の動き', () => {
  it('札を飛ばし、後ろの文字を押し下げてから入った文字を打ち、終われば欄を戻す', async () => {
    const motion = stubAnimate();
    const field = fieldWith('a<lora:x:1>\nb');
    const text = '<lora:x:1>\n';
    playInsertMotion(field, { start: 1, text, origin: new DOMRect(0, 0, 10, 10) });

    expect(motion.animated).toHaveLength(2);
    expect(motion.animated[1]?.textContent).toBe('b');
    const typed = motion.animated[1]?.previousElementSibling;
    expect(typed?.lastElementChild?.textContent).toBe(text);
    expect(field.style.color).toBe('transparent');

    await motion.finish();
    await vi.waitFor(() => expect(field.style.color).toBe(''));
    expect(document.body.children).toHaveLength(1);
  });

  it('飛び立つ所が無ければ札は飛ばさず、打てば写しをすぐ外す', () => {
    const motion = stubAnimate();
    const field = fieldWith('ab\n');
    playInsertMotion(field, { start: 1, text: 'b\n', origin: null });
    expect(motion.animated).toHaveLength(1);

    field.dispatchEvent(new Event('input'));
    expect(field.style.color).toBe('');
    expect(document.body.children).toHaveLength(1);
  });

  it('動きを減らす設定では何もしない', () => {
    const motion = stubAnimate();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const field = fieldWith('ab');
    playInsertMotion(field, { start: 1, text: 'b', origin: new DOMRect(0, 0, 10, 10) });
    expect(motion.animated).toHaveLength(0);
    expect(field.style.color).toBe('');
  });
});
