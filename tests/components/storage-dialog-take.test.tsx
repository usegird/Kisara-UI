// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageDialogHost } from '@/components/llm/dialogs/StorageDialogHost';
import { memoryTable } from '@/store/persist/chat-repo';
import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import { useConnectionStore } from '@/store/use-connection-store';
import { useStorageDialogStore } from '@/store/use-storage-dialog-store';
import { installSystemPromptTable, useSystemPromptsStore } from '@/store/use-system-prompts-store';

import { connectComfy } from '../helpers/connection';

// ─────────────────────────────
// ストレージの管理のバックアップ取得。控えの無い 1 件に「→ バックアップ取得」を出し、
// 押すとその場で控えを書く。テストの環境に IndexedDB が無いので、ブラウザの一覧だけを作り物にする
// ─────────────────────────────

vi.mock('@/store/persist/storage-usage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/persist/storage-usage')>();
  const { useSystemPromptsStore: store } = await import('@/store/use-system-prompts-store');
  return {
    ...actual,
    readStorageUsage: () =>
      Promise.resolve({
        categories: [
          {
            category: { area: 'indexedDb', table: 'system-prompt' },
            items: Object.values(store.getState().templates).map((template) => ({
              key: template.id,
              name: template.name,
              known: null,
              updatedAt: template.updatedAt,
              bytes: 10,
            })),
          },
        ],
        usage: null,
        quota: null,
        persisted: null,
      }),
  };
});

let port: ReturnType<typeof comfyPort>;
let saved: string[];

beforeEach(() => {
  port = comfyPort();
  saved = [];
  installSystemPromptTable(memoryTable());
  useSystemPromptsStore.setState({ templates: {} });
  installComfyPort({
    ...port,
    library: {
      ...port.library,
      list: (_baseUrl, kind) =>
        Promise.resolve(
          kind === 'system-prompts'
            ? [{ v: 1, id: 'kept', name: 'Kept', content: '', createdAt: 1, updatedAt: 1 }]
            : [],
        ),
      save: (_baseUrl, { kind, id }) => {
        saved.push(`${kind}/${id}`);
        return Promise.resolve();
      },
    },
  });
});

afterEach(() => {
  cleanup();
  installComfyPort(port);
  installSystemPromptTable(null);
  useConnectionStore.setState({ status: 'disconnected' });
  useStorageDialogStore.setState({ isOpen: false, start: 'overview', staleNotice: false });
});

async function openTemplates(): Promise<HTMLElement> {
  render(<StorageDialogHost />);
  useStorageDialogStore.getState().open();
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'フォルダを出す' }));
  const nav = await within(dialog).findByRole('navigation', { name: '種類' });
  fireEvent.click(within(nav).getByRole('button', { name: /^システムテンプレート/ }));
  return dialog;
}

describe('バックアップ取得', () => {
  it('控えの無い 1 件にだけ出し、押すとその場で控えを書く', async () => {
    const mine = useSystemPromptsStore.getState().add('Mine', 'body');
    useSystemPromptsStore.setState((state) => ({
      templates: { ...state.templates, kept: { ...mine, id: 'kept', name: 'Kept' } },
    }));
    connectComfy();
    const dialog = await openTemplates();
    const take = await within(dialog).findByRole('button', {
      name: '「Mine」のバックアップを ComfyUI に取る',
    });
    expect(take.textContent).toBe('バックアップ取得');
    expect(
      within(dialog).queryByRole('button', { name: '「Kept」のバックアップを ComfyUI に取る' }),
    ).toBeNull();
    fireEvent.click(take);
    await waitFor(() => expect(saved).toEqual([`system-prompts/${mine.id}`]));
  });

  it('つないでいなければ出さない', async () => {
    useSystemPromptsStore.getState().add('Mine', 'body');
    const dialog = await openTemplates();
    await within(dialog).findByText('ComfyUI につなぐとバックアップを見られます。');
    expect(within(dialog).queryByText('バックアップ取得')).toBeNull();
  });
});
