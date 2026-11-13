// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SidePane } from '@/components/ui/side-pane';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// ダイアログの左右・下の列。線で大きさを変え、列ごとに端末に残す。
// ─────────────────────────────

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ dialogPaneWidths: {} });
});

function styleOf(label: string): CSSStyleDeclaration | undefined {
  return screen.getByText(label).parentElement?.style;
}

describe('ダイアログの列', () => {
  it('左の列は縦線を右キーで広げ、幅を列ごとに残す', () => {
    render(
      <SidePane paneKey="d:left" label="左" side="left" defaultSize={200}>
        <p>中身</p>
      </SidePane>,
    );
    expect(styleOf('中身')?.width).toBe('200px');

    fireEvent.keyDown(screen.getByRole('separator', { name: '左の幅' }), { key: 'ArrowRight' });

    expect(styleOf('中身')?.width).toBe('216px');
    expect(useSettingsStore.getState().dialogPaneWidths['d:left']).toBe(216);
  });

  it('下限は列ごとに決める（既定の 140px より縮められる列もある）', () => {
    render(
      <SidePane paneKey="d:left" label="左" side="left" defaultSize={96} minSize={84}>
        <p>中身</p>
      </SidePane>,
    );

    fireEvent.keyDown(screen.getByRole('separator', { name: '左の幅' }), { key: 'ArrowLeft' });

    expect(styleOf('中身')?.width).toBe('84px');
  });

  it('縮む列は、残した幅を基にしたまま下限まで縮める（既定は縮めない）', () => {
    render(
      <>
        <SidePane paneKey="d:left" label="左" side="left" defaultSize={194} shrinkable>
          <p>縮む</p>
        </SidePane>
        <SidePane paneKey="d:right" label="右" side="right" defaultSize={200}>
          <p>縮まない</p>
        </SidePane>
      </>,
    );
    expect(styleOf('縮む')?.width).toBe('194px');
    expect(styleOf('縮む')?.minWidth).toBe('140px');
    expect(styleOf('縮む')?.flexShrink).toBe('1');
    expect(styleOf('縮まない')?.flexShrink).toBe('');
  });

  it('右の列は向きが逆（左キーで広がる）', () => {
    render(
      <SidePane paneKey="d:right" label="右" side="right" defaultSize={300}>
        <p>中身</p>
      </SidePane>,
    );

    fireEvent.keyDown(screen.getByRole('separator', { name: '右の幅' }), { key: 'ArrowLeft' });

    expect(styleOf('中身')?.width).toBe('316px');
  });

  it('下の列は横線で高さを変える（上キーで広がる）', () => {
    render(
      <SidePane paneKey="d:bottom" label="下" side="bottom" defaultSize={240}>
        <p>中身</p>
      </SidePane>,
    );

    fireEvent.keyDown(screen.getByRole('separator', { name: '下の高さ' }), { key: 'ArrowUp' });

    expect(styleOf('中身')?.height).toBe('256px');
  });
});
