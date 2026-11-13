// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DiagnosticsDialog } from '@/components/app/dialogs/DiagnosticsDialog';
import { clearTrace, traceFault, traceSnapshot } from '@/lib/trace';
import { useDiagnosticsDialogStore } from '@/store/use-diagnostics-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

// ─────────────────────────────
// 診断ファイルを書き出すダイアログ。書き出す前に全文を見せ、
// 選べる区分は選んだときだけ中身に入る
// ─────────────────────────────

afterEach(() => {
  cleanup();
  clearTrace();
  useDiagnosticsDialogStore.setState({ isOpen: false });
  useSettingsStore.setState({ dialogLayouts: {} });
});

async function openDialog(): Promise<HTMLTextAreaElement> {
  render(<DiagnosticsDialog />);
  act(() => useDiagnosticsDialogStore.getState().open());
  const content = await screen.findByRole('textbox', { name: 'ファイルの中身' });
  await waitFor(() => expect((content as HTMLTextAreaElement).value).toContain('"kind"'));
  return content as HTMLTextAreaElement;
}

describe('中身', () => {
  it('説明の「問い合わせフォーム」は、フォームを新しいタブで開くリンク', async () => {
    await openDialog();
    const link = screen.getByRole('link', { name: '問い合わせフォーム' });
    expect(link.getAttribute('href')).toBe('https://contact.kisara-ui.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.closest('p')?.textContent).toMatch(/別途、問い合わせフォームなどから/);
  });

  it('溜めた失敗を全文に出し、選んだ区分だけを足す', async () => {
    traceFault('Card', new Error('boom'));
    const content = await openDialog();
    expect(content.value).toContain('boom');
    expect(content.value).not.toContain('definitionSources');

    fireEvent.click(screen.getByRole('checkbox', { name: /カスタムノードの名前/ }));
    expect(content.value).toContain('definitionSources');
  });

  it('外せない区分は入れたままの印にし、ほかは外せる。全般・ComfyUI・LLM に分ける', async () => {
    const content = await openDialog();
    const format = screen.getByRole<HTMLInputElement>('checkbox', { name: /ファイルの種類/ });
    expect([format.checked, format.disabled]).toEqual([true, true]);
    const app = screen.getByRole<HTMLInputElement>('checkbox', { name: /KisaraUI の版/ });
    expect([app.checked, app.disabled]).toEqual([true, false]);
    fireEvent.click(app);
    expect(content.value).not.toContain('"app"');
    expect(screen.getAllByRole('group').map((group) => group.firstChild?.textContent)).toEqual([
      '全般',
      'ComfyUI',
      'LLM',
    ]);
  });

  it('中身の枠のすぐ下の行に、大きさと「ログをクリア」「エクスポート」を並べる', async () => {
    const content = await openDialog();
    const row = screen.getByRole('button', { name: 'エクスポート' }).parentElement;
    expect(content.nextElementSibling).toBe(row);
    expect(row?.textContent).toMatch(/KB/);
    const names = [...(row?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
    expect(names).toEqual(['ログをクリア', 'エクスポート']);
  });

  it('ログをクリアすると、確かめてから失敗を消す', async () => {
    traceFault('Card', new Error('boom'));
    const content = await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'ログをクリア' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(
      [...confirm.querySelectorAll('button')].find((b) => b.textContent === 'ログをクリア')!,
    );
    expect(traceSnapshot().faults).toHaveLength(0);
    expect(content.value).not.toContain('boom');
  });
});

describe('漏れ', () => {
  it('開け閉めを繰り返しても、閉じたダイアログを残さない', async () => {
    const leak = leakWatch();
    render(<DiagnosticsDialog />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        useDiagnosticsDialogStore.getState().open();
        await Promise.resolve();
      });
      leak.watch(await screen.findByRole('dialog'));
      await act(async () => {
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        await Promise.resolve();
      });
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
