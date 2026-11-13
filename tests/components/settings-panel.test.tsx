// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsPanel } from '@/components/comfy/SettingsPanel';
import { reloadPage } from '@/lib/reload-page';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 設定タブの言語。選ぶと残して読み込み直す。選択肢は各言語をその言語の名前で出す
// ─────────────────────────────

// 読み込み直すのは差し替える（`location` は vitest の vmForks では定義し直せない）
vi.mock('@/lib/reload-page', () => ({ reloadPage: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderPanel(): HTMLSelectElement {
  render(<SettingsPanel />);
  return screen.getByLabelText<HTMLSelectElement>('言語');
}

describe('言語の選択', () => {
  it('今の言語を選んだ状態で、各言語をその言語の名前で出す', () => {
    const select = renderPanel();
    expect(select.value).toBe('ja');
    expect([...select.options].map((option) => option.text)).toEqual([
      'English',
      '日本語',
      '简体中文',
    ]);
  });

  it('選ぶと残して読み込み直す', () => {
    const select = renderPanel();

    fireEvent.change(select, { target: { value: 'zh-Hans' } });

    expect(localStorage.getItem('kisaraui.locale')).toBe('zh-Hans');
    expect(reloadPage).toHaveBeenCalledOnce();
  });
});

describe('ComfyUI バックエンドの欄', () => {
  it('見出しは Comfyバックエンド、枠線では囲まず、接続先を出して状況は再接続のボタンの右に置く', () => {
    useSettingsStore.setState({ baseUrl: 'http://127.0.0.1:8188' });
    renderPanel();
    expect(screen.getByText('Comfyバックエンド').tagName).toBe('P');
    // 接続先は入力の欄でなく文字で出す（入力はポップアップで行う）
    expect(screen.queryByLabelText('接続先 ComfyUI の URL')).toBeNull();
    const url = screen.getByText('http://127.0.0.1:8188');
    const button = screen.getByRole('button', { name: '再接続' });
    const row = button.parentElement as HTMLElement;
    expect([...row.children].map((child) => child.tagName)).toEqual(['BUTTON', 'SPAN']);
    expect(url.parentElement).toBe(row.parentElement);
    expect(row.closest('.border')).toBeNull();
  });

  it('再接続は「ComfyUI に接続する」のポップアップを出すよう頼む（つなぎ直しはポップアップで行う）', () => {
    useComfyConnectDialogStore.setState({ requested: false });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '再接続' }));
    expect(useComfyConnectDialogStore.getState().requested).toBe(true);
  });

  it('幅の上限は操作の部品だけにかけ、説明の文にはかけない', () => {
    renderPanel();
    expect(screen.getByLabelText('言語').className).toContain('max-w-(--control-max)');
    expect(screen.getByText(/拡張子を除いた名前/).className).not.toContain('max-w');
  });
});

describe('通過したノードの線', () => {
  it('既定は切（出さない）で、入れると線を出す', () => {
    useSettingsStore.setState({ showPassedLines: false });
    renderPanel();

    const toggle = screen.getByRole('switch', { name: '通過したノードの線も表示' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(useSettingsStore.getState().showPassedLines).toBe(true);
    useSettingsStore.setState({ showPassedLines: false });
  });
});

describe('実行の記録', () => {
  it('既定は切で、スイッチで入れ切りする', () => {
    useSettingsStore.setState({ recordRunHistory: false });
    renderPanel();

    const toggle = screen.getByRole('switch', { name: 'プロンプトの履歴を残す' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(useSettingsStore.getState().recordRunHistory).toBe(true);
    useSettingsStore.setState({ recordRunHistory: false });
  });
});
