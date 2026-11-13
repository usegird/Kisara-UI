// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { focusTappedField } from '@/components/comfy/flow/tap-to-edit';

import { stubMediaQuery } from '../helpers/dom';

// ─────────────────────────────
// 指では欄を押してから書き換える。
// 指で触れる端末では焦点の無い欄が触れても受けないので、押した所の囲みから欄を探して開く
// ─────────────────────────────

function Card(): React.ReactElement {
  return (
    <div data-testid="root" onClick={focusTappedField}>
      <article>
        <div data-testid="row">
          <span data-testid="label">strength</span>
          <input aria-label="strength" defaultValue="0.8" />
        </div>
        <div>
          <input aria-label="width" defaultValue="512" />
          <input aria-label="height" defaultValue="512" />
          <span data-testid="pair">size</span>
        </div>
        <button type="button">Add</button>
      </article>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('指で押した所の欄を開く', () => {
  it('欄が 1 つだけの行を押すと、その欄に焦点を当てる', () => {
    stubMediaQuery('(pointer: coarse)', true);
    render(<Card />);
    fireEvent.click(screen.getByTestId('label'));
    expect(document.activeElement).toBe(screen.getByLabelText('strength'));
  });

  it('欄が 2 つある囲みやボタンでは、どれも開かない', () => {
    stubMediaQuery('(pointer: coarse)', true);
    render(<Card />);
    fireEvent.click(screen.getByTestId('pair'));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(document.activeElement).toBe(document.body);
  });

  it('マウスの端末では何もしない（欄が自分で受ける）', () => {
    stubMediaQuery('(pointer: coarse)', false);
    render(<Card />);
    fireEvent.click(screen.getByTestId('label'));
    expect(document.activeElement).toBe(document.body);
  });
});
