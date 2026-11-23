// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SidePanel } from '@/components/comfy/SidePanel';
import { DEFAULT_SIDE_PANEL_HEIGHT } from '@/store/settings-fields/side-panel-height';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

vi.mock('@/hooks/run/use-queue-watch', () => ({ useQueueWatch: () => undefined }));

afterEach(() => {
  cleanup();
  useSettingsStore.getState().setSidePanelDock('right');
  useSettingsStore.getState().setSidePanelHeight(DEFAULT_SIDE_PANEL_HEIGHT);
  useSettingsStore.getState().setSidePanelCollapsed(false);
});

describe('右の列', () => {
  it('右下のアイコン 1 つで置き場所を入れ替え、絵は押したときの行き先を出す', () => {
    render(<SidePanel />);

    fireEvent.click(screen.getByRole('button', { name: '下に置く' }));
    expect(useSettingsStore.getState().sidePanelDock).toBe('bottom');
    expect(screen.queryByRole('button', { name: '下に置く' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '右に置く' }));
    expect(useSettingsStore.getState().sidePanelDock).toBe('right');
  });

  it('右では幅の境目、下では高さの境目を出す', () => {
    render(<SidePanel />);
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('vertical');

    fireEvent.click(screen.getByRole('button', { name: '下に置く' }));
    const handle = screen.getByRole('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal');

    const before = useSettingsStore.getState().sidePanelHeight;
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(useSettingsStore.getState().sidePanelHeight).toBe(before + 16);
  });

  it('下に置くと、タブを左端に縦に並べ、ピン止めを右上・置き場所の切り替えを右下に置く', () => {
    useSettingsStore.getState().setSidePanelDock('bottom');
    render(<SidePanel />);
    const list = screen.getByRole('tablist');
    expect(list.className).toContain('flex-col');
    expect(list.parentElement?.className.split(' ')).toContain('flex-row');
    expect(list.getAttribute('aria-orientation')).toBe('vertical');
    expect(screen.getByRole('tabpanel').className).toContain('pl-5');
    expect(screen.getByRole('tab', { name: /タスク/ }).className).toContain('bg-foreground/10');
    expect(screen.getByRole('tab', { name: /設定/ }).className).not.toContain('bg-foreground/10');
    expect(screen.getByRole('tab', { name: /タスク/ }).className.split(' ')).not.toContain(
      'border',
    );
    expect(list.parentElement?.parentElement?.className).toContain('border-t');
    const pin = screen.getByRole('button', { name: 'ピン止めを外す（アイコンに縮める）' });
    const dockToggle = screen.getByRole('button', { name: '右に置く' });
    expect(pin.parentElement?.className).toContain('top-1');
    expect(dockToggle.parentElement?.className).toContain('bottom-1');
    expect(pin.parentElement?.parentElement?.className).toContain('bg-pane');
  });

  it('右ではタブを折り返さず、列の最小幅をタブ 3 つ分（並べたタブの幅）にする', () => {
    const { container } = render(<SidePanel />);
    expect(screen.getByRole('tablist').className).not.toContain('flex-wrap');
    expect(screen.getByRole('tab', { name: /タスク/ }).className.split(' ')).not.toContain(
      'border',
    );
    expect(screen.getByRole('tab', { name: /タスク/ }).className).toContain('bg-foreground/10');
    expect(screen.getByRole('tabpanel').parentElement?.className).toContain('bg-pane');
    expect((container.firstChild as HTMLElement).className).toContain('min-w-min');
  });

  it('ピン止めを外して細い 1 行に縮め、行のアイコンで中身を滑り出させ、ピン止めで戻す', async () => {
    const { container } = render(<SidePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'ピン止めを外す（アイコンに縮める）' }));
    expect(useSettingsStore.getState().sidePanelCollapsed).toBe(true);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(container.querySelector('[role="separator"]')).toBeNull();

    const rail = screen.getByRole('toolbar', { name: '右の列' });
    const names = [...rail.querySelectorAll(':scope > button')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(names).toEqual(['タスク', '履歴', 'エラー', '設定', '下に置く']);

    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    expect(screen.getByRole('region', { name: '設定' })).toBeDefined();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('region', { name: '設定' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    expect(screen.queryByRole('region', { name: '設定' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: '設定' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'タスク' }));
    const drawer = screen.getByRole('region', { name: 'タスク' });
    expect(drawer.style.width).toBe(`${String(useSettingsStore.getState().columnWidths.queue)}px`);
    const before = useSettingsStore.getState().columnWidths.queue;
    fireEvent.keyDown(within(drawer).getByRole('separator'), { key: 'ArrowLeft' });
    expect(useSettingsStore.getState().columnWidths.queue).toBeGreaterThan(before);
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'タスク' }));
    fireEvent.click(screen.getByRole('button', { name: 'ピン止めする' }));
    expect(useSettingsStore.getState().sidePanelCollapsed).toBe(false);
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('vertical');
    await Promise.resolve();
  });

  it('引き出しを開け閉めしても、閉じた中身を残さない', async () => {
    useSettingsStore.getState().setSidePanelCollapsed(true);
    render(<SidePanel />);
    const leak = leakWatch();

    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      fireEvent.click(screen.getByRole('button', { name: '設定' }));
      leak.watch(screen.getByRole('region', { name: '設定' }));
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
        await Promise.resolve();
      });
      await waitFor(() => expect(screen.queryByRole('region', { name: '設定' })).toBeNull());
    }

    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
