// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatExtensionPanel } from '@/components/llm/side-panel/ChatExtensionPanel';
import { memoryTable } from '@/store/persist/chat-repo';
import { installEmbeddingPort } from '@/store/ports/embedding-port';
import { installDictionaryTable, useDictionariesStore } from '@/store/use-dictionaries-store';
import { enabledDictionaryIds, useSettingsStore } from '@/store/use-settings-store';
import { useTermsStore } from '@/store/use-terms-store';

import { fakeEmbeddingPort } from '../helpers/embedding';

// ─────────────────────────────
// 機能のタブのカードの見出しのスイッチと、Workflow 実行の確認スキップの注意
// ─────────────────────────────

const BYPASS = '実行前に確認を行わない';

beforeEach(() => {
  // 辞書のカードの近似判定が、置いたモデルの一覧を読む
  installEmbeddingPort(fakeEmbeddingPort());
  installDictionaryTable(memoryTable());
  useDictionariesStore.setState({ dictionaries: {}, loaded: true });
  useSettingsStore.setState({
    chatComfyToolsSkipConfirm: false,
    loreDictionariesOn: true,
    loreDictionaryIds: ['d1'],
  });
  useTermsStore.setState({ bypass: null });
});

afterEach(() => {
  cleanup();
  installDictionaryTable(null);
  useSettingsStore.setState({ chatComfyToolsSkipConfirm: false, loreDictionaryIds: [] });
  useTermsStore.setState({ bypass: null });
});

describe('実行前に確認を行わない', () => {
  it('入れるときに注意を出し、やめたら入れず、合意も残さない', () => {
    render(<ChatExtensionPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: BYPASS }));
    expect(screen.getByRole('alertdialog').textContent).toContain('意図しない Workflow の処理');
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(useSettingsStore.getState().chatComfyToolsSkipConfirm).toBe(false);
    expect(useTermsStore.getState().bypass).toBeNull();
  });

  it('理解したを押すと入れて、合意の時刻を残す。外すときは注意を出さない', () => {
    render(<ChatExtensionPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: BYPASS }));
    expect(screen.getByRole('alertdialog').textContent).toContain('Workflow 実行の確認スキップ');
    fireEvent.click(screen.getByRole('button', { name: '理解した' }));
    expect(useSettingsStore.getState().chatComfyToolsSkipConfirm).toBe(true);
    expect(useTermsStore.getState().bypass?.acceptedAt).toBeTypeOf('string');
    fireEvent.click(screen.getByRole('checkbox', { name: BYPASS }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useSettingsStore.getState().chatComfyToolsSkipConfirm).toBe(false);
  });
});

describe('動的追加辞書のカードの見出しのスイッチ', () => {
  it('切ると全体の辞書を当てない。1 冊ずつのチェックは残す', () => {
    render(<ChatExtensionPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: '動的追加辞書' }));
    const state = useSettingsStore.getState();
    expect(state.loreDictionariesOn).toBe(false);
    expect(enabledDictionaryIds(state)).toEqual([]);
    expect(state.loreDictionaryIds).toEqual(['d1']);
  });
});
