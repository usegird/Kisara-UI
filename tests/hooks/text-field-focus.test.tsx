// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useTextFieldWhile } from '@/hooks/flow/use-text-field-focus';
import type { TextField } from '@/lib/insert-at-caret';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const onlyTextarea = (field: TextField): boolean => field instanceof HTMLTextAreaElement;

const seen: { current: TextField | null } = { current: null };

function report(value: TextField | null): void {
  seen.current = value;
}

function Report({ value }: { readonly value: TextField | null }): null {
  useEffect(() => {
    report(value);
  }, [value]);
  return null;
}

function While({ active }: { readonly active: boolean }): React.ReactElement {
  return <Report value={useTextFieldWhile(onlyTextarea, active)} />;
}

function field<K extends 'textarea' | 'input'>(tag: K): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
}

function focus(element: HTMLElement): void {
  act(() => {
    element.focus();
  });
}

function blur(element: HTMLElement): void {
  act(() => {
    element.blur();
  });
}

describe('useTextFieldWhile', () => {
  it('受け付けない欄に移っても覚えておき、画面から消えたら外す', () => {
    const area = field('textarea');
    const input = field('input');
    const view = render(<While active />);

    focus(area);
    focus(input);
    expect(seen.current).toBe(area);

    area.remove();
    view.rerender(<While active />);
    expect(seen.current).toBeNull();
  });

  it('見張っている間は最後に入った欄を返し、同じ欄に入り直しても変わらない', () => {
    const first = field('textarea');
    const second = field('textarea');
    render(<While active />);

    focus(first);
    blur(first);
    focus(first);
    expect(seen.current).toBe(first);
    focus(second);
    expect(seen.current).toBe(second);
  });

  it('開いたときに作られる（最初から見張る）なら、作られた時点でキャレットのある欄を拾う', () => {
    const area = field('textarea');
    focus(area);
    render(<While active />);

    expect(seen.current).toBe(area);
  });

  it('閉じている間に作られ、開いたときにキャレットのある欄を拾う', () => {
    const area = field('textarea');
    const view = render(<While active={false} />);
    focus(area);
    view.rerender(<While active />);

    expect(seen.current).toBe(area);
  });
});

describe('画面の切り替えでの引き継ぎ', () => {
  const second: { current: TextField | null } = { current: null };

  function Second({ value }: { readonly value: TextField | null }): null {
    useEffect(() => {
      second.current = value;
    }, [value]);
    return null;
  }

  function Pair({ first }: { readonly first: boolean | null }): React.ReactElement {
    return (
      <>
        <While active={first === true} />
        <Second value={useTextFieldWhile(onlyTextarea, first === false)} />
      </>
    );
  }

  it('切り替える前の画面の差し込み先を、焦点が外れていても引き継ぐ', () => {
    const area = field('textarea');
    const card = field('input');
    focus(area);
    const view = render(<Pair first />);
    focus(card);
    view.rerender(<Pair first={false} />);

    expect(second.current).toBe(area);
  });

  it('切り替えで開く画面が後から始まっても（読み込みを待つ）、操作が挟まらなければ引き継ぐ', () => {
    const area = field('textarea');
    focus(area);
    const view = render(<Pair first />);
    blur(area);
    view.rerender(<Pair first={null} />);
    view.rerender(<Pair first={false} />);

    expect(second.current).toBe(area);
  });

  it('どの画面も閉じてから、押して開き直したときは引き継がない', () => {
    const area = field('textarea');
    focus(area);
    const view = render(<Pair first />);
    blur(area);
    view.rerender(<Pair first={null} />);
    fireEvent.pointerDown(document.body);
    view.rerender(<Pair first={false} />);

    expect(second.current).toBeNull();
  });
});

describe('漏れ', () => {
  function focusAndRemove(watch: (target: object) => void): void {
    const box = document.createElement('div');
    const input = document.createElement('input');
    box.append(input);
    document.body.append(box);
    focus(input);
    blur(input);
    box.remove();
    watch(input);
  }

  it('焦点が外れた欄を残さない（同じ値の更新を積まない）', async () => {
    render(<While active />);
    const leak = leakWatch();
    for (let round = 0; round < LEAK_ROUNDS; round += 1) focusAndRemove(leak.watch);

    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
