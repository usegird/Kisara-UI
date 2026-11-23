// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useColumnZoom } from '@/hooks/flow/use-column-zoom';
import type { ZoomColumn } from '@/store/settings-fields/column-zoom';
import { useSettingsStore } from '@/store/use-settings-store';

afterEach(cleanup);
beforeEach(() => {
  act(() => {
    for (const column of ['app', 'cards', 'variables'] as const) {
      useSettingsStore.getState().resetColumnZoom(column);
    }
    useSettingsStore.getState().resetNarrowZoom();
  });
});

const columnOf = (target: Element): ZoomColumn | null =>
  target.closest('[data-testid="app"]') ? 'app' : null;

function Flow({ unified = false }: { readonly unified?: boolean }): React.ReactElement {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { zooms: shown, zoomBy } = useColumnZoom(host, {
    columnOf,
    columnAt: () => 'cards',
    anchorOf: () => null,
    unified,
  });
  return (
    <div ref={setHost} data-testid="flow">
      <output data-testid="shown">{`${String(shown.app)}/${String(shown.variables)}`}</output>
      <button type="button" onClick={() => zoomBy('cards', 1)}>
        広げる
      </button>
      <div data-testid="app">
        <input aria-label="欄" />
      </div>
      <div data-testid="gap" />
    </div>
  );
}

const zooms = (): Readonly<Record<ZoomColumn, number>> => useSettingsStore.getState().columnZooms;

describe('列の倍率の受け口', () => {
  it('Ctrl＋ホイールで指している列だけが変わり、ページの拡大縮小を止める', () => {
    render(<Flow />);
    const allowed = fireEvent.wheel(screen.getByTestId('app'), { deltaY: -100, ctrlKey: true });
    expect(allowed).toBe(false);
    expect(zooms()).toMatchObject({ app: 120, cards: 100 });

    fireEvent.wheel(screen.getByTestId('gap'), { deltaY: 100, ctrlKey: true });
    expect(zooms().cards).toBe(80);
  });

  it('Ctrl が無ければ何もしない。少しずつ届く量は貯めてから 1 刻み', () => {
    render(<Flow />);
    const app = screen.getByTestId('app');
    fireEvent.wheel(app, { deltaY: -100 });
    fireEvent.wheel(app, { deltaY: -30, ctrlKey: true });
    expect(zooms().app).toBe(100);
    fireEvent.wheel(app, { deltaY: -30, ctrlKey: true });
    expect(zooms().app).toBe(120);
  });

  it('キーは焦点のある列に効き、Ctrl＋0 で等倍へ戻す', () => {
    render(<Flow />);
    screen.getByLabelText('欄').focus();
    fireEvent.keyDown(document.activeElement ?? document.body, { code: 'Minus', altKey: true });
    expect(zooms().app).toBe(80);
    fireEvent.keyDown(document.activeElement ?? document.body, { code: 'Digit0', ctrlKey: true });
    expect(zooms().app).toBe(100);
  });

  it('焦点もポインタも列に無ければキーは素通し', () => {
    render(<Flow />);
    const allowed = fireEvent.keyDown(document.body, { code: 'Equal', altKey: true });
    expect(allowed).toBe(true);
    expect(zooms()).toMatchObject({ app: 100, cards: 100 });
  });

  it('3 列で 1 つのときは、どの列で操作しても全体の倍率が変わり、列ごとの倍率は変えない', () => {
    render(<Flow unified />);
    fireEvent.wheel(screen.getByTestId('app'), { deltaY: -100, ctrlKey: true });
    expect(useSettingsStore.getState().narrowZoom).toBe(120);
    expect(screen.getByTestId('shown').textContent).toBe('120/120');

    fireEvent.click(screen.getByRole('button', { name: '広げる' }));
    expect(useSettingsStore.getState().narrowZoom).toBe(140);
    expect(zooms()).toMatchObject({ app: 100, cards: 100, variables: 100 });
  });
});
