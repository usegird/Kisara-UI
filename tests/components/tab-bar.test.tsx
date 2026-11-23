// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TabBar } from '@/components/app/TabBar';
import { ContextMenuItem } from '@/components/ui/context-menu';
import { useTabsStore, type TabLabel } from '@/store/use-tabs-store';

const LABEL: TabLabel = { name: 'A', dirty: false };

beforeEach(() => {
  useTabsStore.getState().addTab();
});

afterEach(() => {
  cleanup();
});

const KINDS = [{ key: 'chat', label: '会話', onAdd: vi.fn() }];

function renderBar(): void {
  render(<TabBar useTabLabel={() => LABEL} onRename={vi.fn()} kinds={KINDS} />);
}

describe('タブバーの読み上げ', () => {
  it('tablist の子はタブだけ（閉じる・種類を選ぶ ▾ は外に置く）。＋ は置かない', () => {
    renderBar();
    const list = screen.getByRole('tablist');
    const owned = [...list.querySelectorAll('button, [role]')].filter(
      (element) => element.closest('[aria-hidden="true"]') === null,
    );
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.every((element) => element.getAttribute('role') === 'tab')).toBe(true);
    expect(screen.getByRole('button', { name: 'タブの種類を選ぶ' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'タブを追加' })).toBeNull();
  });

  it('閉じる × を置かず、タブを中身の欄（tabpanel）と結ぶ', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: /閉じる/ })).toBeNull();
    expect(document.querySelectorAll('[title*="を閉じる"]')).toHaveLength(0);
    const tab = screen.getAllByRole('tab').at(-1);
    expect(tab?.getAttribute('aria-controls')).toBe('app-tab-panel');
    expect(tab?.id).toMatch(/^app-tab-/);
  });

  it('タブの上の Delete で閉じる', () => {
    renderBar();
    const before = useTabsStore.getState().tabs.length;
    const tab = screen.getAllByRole('tab').at(-1);
    if (tab === undefined) throw new Error('no tab');
    expect(tab.getAttribute('aria-keyshortcuts')).toBe('Delete');
    fireEvent.keyDown(tab, { key: 'Delete' });
    expect(useTabsStore.getState().tabs.length).toBe(before - 1);
  });
});

describe('タブの右クリックメニュー', () => {
  it('種別の層の項目は、保存などを先頭に、並びの項目を「右へ移す」の下に置く', async () => {
    render(
      <TabBar
        useTabLabel={() => LABEL}
        onRename={vi.fn()}
        menu={<ContextMenuItem onClick={vi.fn()}>上書き保存</ContextMenuItem>}
        moveMenu={<ContextMenuItem onClick={vi.fn()}>タブを複製</ContextMenuItem>}
      />,
    );
    const { activeId } = useTabsStore.getState();
    const tab = screen.getAllByRole('tab').find((item) => item.id.endsWith(activeId));
    if (tab === undefined) throw new Error('no tab');
    fireEvent.contextMenu(tab);
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual(['上書き保存', '左へ移す', '右へ移す', 'タブを複製', '閉じる']);
  });
});
