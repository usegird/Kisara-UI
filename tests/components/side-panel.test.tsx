// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SidePanel } from '@/components/comfy/SidePanel';
import { DEFAULT_SIDE_PANEL_HEIGHT } from '@/store/settings-fields/side-panel-height';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

// 見張りは ComfyUI に問い合わせるので、テストでは動かさない
vi.mock('@/hooks/run/use-queue-watch', () => ({ useQueueWatch: () => undefined }));

// ─────────────────────────────
// 右の列。置き場所は右か下を選べ、右では幅、下では高さを変える。
// ─────────────────────────────

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
    // 行き先が入れ替わる（アイコンは 1 つだけ）
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

    // 上端の境目なので、上キーで伸びる
    const before = useSettingsStore.getState().sidePanelHeight;
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(useSettingsStore.getState().sidePanelHeight).toBe(before + 16);
  });

  it('下に置くと、タブを左端に縦に並べ、ピン止めを右上・置き場所の切り替えを右下に置く', () => {
    useSettingsStore.getState().setSidePanelDock('bottom');
    render(<SidePanel />);
    const list = screen.getByRole('tablist');
    // タブは帯の左端に縦に並べ、中身の左端は空ける
    expect(list.className).toContain('flex-col');
    expect(list.parentElement?.className.split(' ')).toContain('flex-row');
    expect(list.getAttribute('aria-orientation')).toBe('vertical');
    expect(screen.getByRole('tabpanel').className).toContain('pl-5');
    // タブに枠線は引かず、選んでいるタブだけ札として塗る（中身とはつなげない）
    expect(screen.getByRole('tab', { name: /タスク/ }).className).toContain('bg-foreground/10');
    expect(screen.getByRole('tab', { name: /設定/ }).className).not.toContain('bg-foreground/10');
    expect(screen.getByRole('tab', { name: /タスク/ }).className.split(' ')).not.toContain(
      'border',
    );
    // 帯の上端に本体との境目の線を引く（高さを変える境目）
    expect(list.parentElement?.parentElement?.className).toContain('border-t');
    // ピン止めは中身の欄の右上、置き場所の切り替えは右下の角に置く（欄からはみ出さない）
    const pin = screen.getByRole('button', { name: 'ピン止めを外す（アイコンに縮める）' });
    const dockToggle = screen.getByRole('button', { name: '右に置く' });
    expect(pin.parentElement?.className).toContain('top-1');
    expect(dockToggle.parentElement?.className).toContain('bottom-1');
    expect(pin.parentElement?.parentElement?.className).toContain('bg-pane');
  });

  it('右ではタブを折り返さず、列の最小幅をタブ 3 つ分（並べたタブの幅）にする', () => {
    const { container } = render(<SidePanel />);
    expect(screen.getByRole('tablist').className).not.toContain('flex-wrap');
    // タブに枠線は引かず、選んでいるタブは札として塗る。中身の欄は薄い地の色で塗る
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

    // 上からタスク・履歴・エラー・設定。戻すアイコンは持たない
    const rail = screen.getByRole('toolbar', { name: '右の列' });
    const names = [...rail.querySelectorAll(':scope > button')].map((b) =>
      b.getAttribute('aria-label'),
    );
    // 置き場所の切り替えも縮めたまま使える
    expect(names).toEqual(['タスク', '履歴', 'エラー', '設定', '下に置く']);

    // 押すと引き出しを出し、外を押すと引っ込む。同じアイコンでも引っ込む
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

    // 引き出しは縮める前の列と同じ幅で、端の境目で幅を変えられる
    fireEvent.click(screen.getByRole('button', { name: 'タスク' }));
    const drawer = screen.getByRole('region', { name: 'タスク' });
    expect(drawer.style.width).toBe(`${String(useSettingsStore.getState().columnWidths.queue)}px`);
    const before = useSettingsStore.getState().columnWidths.queue;
    fireEvent.keyDown(within(drawer).getByRole('separator'), { key: 'ArrowLeft' });
    expect(useSettingsStore.getState().columnWidths.queue).toBeGreaterThan(before);
    fireEvent.keyDown(document, { key: 'Escape' });

    // 引き出しのピン止めで列に戻す
    fireEvent.click(screen.getByRole('button', { name: 'タスク' }));
    fireEvent.click(screen.getByRole('button', { name: 'ピン止めする' }));
    expect(useSettingsStore.getState().sidePanelCollapsed).toBe(false);
    // 戻すと前の置き場所（右）で列を出す
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
