// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { arrowSelect, type ArrowSelectLayout } from '@/components/ui/arrow-select';

afterEach(cleanup);

const NAMES = ['a', 'b', 'c', 'd'];

function placeAsGrid(element: HTMLElement, index: number): void {
  const left = (index % 2) * 100;
  const top = Math.floor(index / 2) * 50;
  element.getBoundingClientRect = () => new DOMRect(left, top, 90, 40);
}

function Picker({ layout }: { readonly layout: ArrowSelectLayout }): React.ReactElement {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div>
      <ul aria-label="一覧" onKeyDown={(event) => arrowSelect(event, layout)}>
        <li>
          <input aria-label="名前" />
        </li>
        {NAMES.map((name, index) => (
          <li key={name}>
            <button
              type="button"
              ref={(element) => {
                if (element !== null && layout === 'grid') placeAsGrid(element, index);
              }}
              aria-pressed={name === selected}
              onClick={() => setSelected(name)}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function pressed(): string | undefined {
  return screen
    .getAllByRole('button')
    .find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent;
}

describe('一覧の矢印キー', () => {
  it('縦の一覧は上下で隣を選び直して焦点も移し、一覧を送らない。端では止まる', () => {
    render(<Picker layout="list" />);
    const first = screen.getByRole('button', { name: 'a' });
    fireEvent.click(first);
    first.focus();
    expect(fireEvent.keyDown(first, { key: 'ArrowDown' })).toBe(false);
    expect(pressed()).toBe('b');
    expect(document.activeElement?.textContent).toBe('b');
    fireEvent.keyDown(document.activeElement ?? first, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement ?? first, { key: 'ArrowUp' });
    expect(pressed()).toBe('a');
  });

  it('格子は左右で前後、上下で上下の段の近い位置へ移る', () => {
    render(<Picker layout="grid" />);
    const first = screen.getByRole('button', { name: 'a' });
    fireEvent.click(first);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(pressed()).toBe('b');
    fireEvent.keyDown(document.activeElement ?? first, { key: 'ArrowDown' });
    expect(pressed()).toBe('d');
    fireEvent.keyDown(document.activeElement ?? first, { key: 'ArrowLeft' });
    expect(pressed()).toBe('c');
  });

  it('選んでいなければ、また縦の一覧の左右と文字の欄の中は横取りしない', () => {
    render(<Picker layout="list" />);
    const first = screen.getByRole('button', { name: 'a' });
    expect(fireEvent.keyDown(first, { key: 'ArrowDown' })).toBe(true);
    fireEvent.click(first);
    first.focus();
    expect(fireEvent.keyDown(first, { key: 'ArrowRight' })).toBe(true);
    expect(fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' })).toBe(true);
    expect(pressed()).toBe('a');
  });
});
