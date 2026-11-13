// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageDialogHost } from '@/components/llm/dialogs/StorageDialogHost';
import { ComfyBackupField } from '@/components/llm/side-panel/ComfyBackupField';
import { toastManager } from '@/components/ui/toast-manager';
import { downloadBlob } from '@/lib/download';
import { gzipLines } from '@/lib/json-lines';
import { PRESS_GUARD_MS } from '@/lib/press-guard';
import { reloadPage } from '@/lib/reload-page';
import { memoryTable } from '@/store/persist/chat-repo';
import { readStorageExport } from '@/store/persist/storage-export';
import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import { installEmbeddingPort } from '@/store/ports/embedding-port';
import { useConnectionStore } from '@/store/use-connection-store';
import { SETTINGS_KEY, useSettingsStore } from '@/store/use-settings-store';
import { useStorageDialogStore } from '@/store/use-storage-dialog-store';
import { installSystemPromptTable, useSystemPromptsStore } from '@/store/use-system-prompts-store';

import { connectComfy } from '../helpers/connection';
import { fakeEmbeddingPort, type FakeEmbeddingPort } from '../helpers/embedding';
import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

vi.mock('@/lib/reload-page', () => ({ reloadPage: vi.fn() }));
vi.mock('@/lib/download', () => ({ downloadText: vi.fn(), downloadBlob: vi.fn() }));

// ─────────────────────────────
// ストレージの管理。場所の選び方・階層の帯・印を付けてまとめて消す流れ・バックアップの列を確かめる。
// ─────────────────────────────

let embedding: FakeEmbeddingPort;
let port: ReturnType<typeof comfyPort>;

beforeEach(() => {
  // ユーザーフォルダは既定で空にする（つないだテストで接続先へ取りに行かない）
  port = {
    ...comfyPort(),
    userFiles: {
      list: () => Promise.resolve([]),
      read: () => Promise.resolve(null),
      remove: () => Promise.resolve(),
    },
  };
  installComfyPort(port);
  localStorage.clear();
  embedding = fakeEmbeddingPort(null, [{ id: 'org/model', bytes: 2048 }]);
  installEmbeddingPort(embedding);
  installSystemPromptTable(memoryTable());
  useSystemPromptsStore.setState({ templates: {} });
  vi.mocked(reloadPage).mockClear();
  vi.mocked(downloadBlob).mockClear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  installComfyPort(port);
  installSystemPromptTable(null);
  useConnectionStore.setState({ status: 'disconnected' });
  useSettingsStore.setState({ dialogLayouts: {}, dialogPaneWidths: {}, dialogPanePins: {} });
  useStorageDialogStore.setState({ isOpen: false, start: 'overview', staleNotice: false });
  vi.useRealTimers();
});

/** 設定の欄と、ダイアログの出し先（画面全体で 1 つ） */
function Field(): React.ReactElement {
  return (
    <>
      <ComfyBackupField />
      <StorageDialogHost />
    </>
  );
}

async function openDialog(): Promise<HTMLElement> {
  render(<Field />);
  fireEvent.click(screen.getByRole('button', { name: 'ストレージの管理' }));
  return screen.findByRole('dialog');
}

/** 書き出しのファイル（1 行目に見出し、続けて 1 件 1 行。gzip で縮める） */
async function exportedFile(category: string, items: Record<string, unknown>): Promise<Blob> {
  const header = JSON.stringify({ format: 'kisaraui-storage-export', version: 1, category });
  const lines = Object.entries(items).map(([key, value]) => JSON.stringify({ key, value }));
  return gzipLines([header, ...lines], 'application/gzip');
}

/** フォルダのアイコンで左の列を一時的に出し、場所を選ぶ（選ぶと閉じる） */
async function choose(dialog: HTMLElement, name: string): Promise<void> {
  fireEvent.click(within(dialog).getByRole('button', { name: 'フォルダを出す' }));
  const nav = await within(dialog).findByRole('navigation', { name: '種類' });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${name}`) }));
}

/** 適用を押す時刻。押すたびに進め、前のテストの押下の見張りの間（PRESS_GUARD_MS）を外す */
let pressedAt = Date.now();

async function apply(dialog: HTMLElement): Promise<void> {
  pressedAt = Math.max(pressedAt, Date.now()) + 10 * PRESS_GUARD_MS;
  vi.setSystemTime(pressedAt);
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '適用' }));
    await Promise.resolve();
  });
}

/** 控えにシステムテンプレートを 2 件置き、つなぐ。消した控えの id を返す */
function backupTemplates(): string[] {
  const removed: string[] = [];
  installComfyPort({
    ...port,
    library: {
      ...port.library,
      list: () =>
        Promise.resolve([
          { v: 1, id: 't1', name: 'One', content: 'a', createdAt: 1, updatedAt: 1 },
          { v: 1, id: 't2', name: 'Two', content: 'b', createdAt: 1, updatedAt: 2 },
        ]),
      remove: (_baseUrl, kind, id) => {
        removed.push(`${kind}/${id}`);
        return Promise.resolve();
      },
    },
  });
  connectComfy();
  return removed;
}

describe('全体', () => {
  it('はじめは全体を選び、合計と、全体の下の localStorage・sessionStorage と目的ごとの行を出す', async () => {
    const dialog = await openDialog();
    expect(await within(dialog).findByText(/^ブラウザの合計/)).toBeTruthy();
    expect(within(dialog).getByText('バックアップの合計: 未接続')).toBeTruthy();
    for (const name of ['LLM', 'ComfyUI', 'localStorage', 'sessionStorage', '埋め込みモデル']) {
      expect(within(dialog).getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(within(dialog).queryByText('共通')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'IndexedDB' })).toBeTruthy();
  });

  it('IndexedDB は大きい保存領域の表を並べ、押すとその種類へ移る（種類の説明は出さない）', async () => {
    const dialog = await openDialog();
    await choose(dialog, 'IndexedDB');
    const crumbs = within(dialog).getByRole('navigation', { name: '今の場所' });
    expect(crumbs.textContent).toBe('全体IndexedDB');
    for (const name of ['会話', 'ノード定義', '編集ワークフロー']) {
      expect(within(dialog).getByRole('button', { name })).toBeTruthy();
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'ノード定義' }));
    expect(crumbs.textContent).toBe('全体ComfyUIノード定義');
    expect(
      within(dialog).queryByText('ComfyUI から読んだノード定義。接続先ごとに 1 件。'),
    ).toBeNull();
  });
});

describe('左の列', () => {
  it('適用とフォルダの切り替えは、ピン止めしても帯の左のまとまりから動かない', async () => {
    const dialog = await openDialog();
    const lead = within(dialog).getByRole('toolbar', { name: '適用とフォルダ' });
    expect(within(lead).getByRole('button', { name: '適用' })).toHaveProperty('disabled', true);
    fireEvent.click(within(lead).getByRole('button', { name: 'フォルダを出す' }));
    fireEvent.click(within(lead).getByRole('button', { name: /ピン止めする/ }));
    expect(within(lead).getByRole('button', { name: /ピン止めをやめる/ })).toBeTruthy();
  });

  it('左の列は、いちばん長い名前に大きさを並べた幅より広げない', async () => {
    useSettingsStore.getState().setDialogPaneWidth('llm-storage:left', 400);
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'フォルダを出す' }));
    const nav = within(dialog).getByRole('navigation', { name: '種類' });
    expect(nav.parentElement?.style.width).toBe('194px');
  });

  it('フォルダのアイコンで出す → ピン止め → やめると巡り、ピン止めを端末に残す', async () => {
    const dialog = await openDialog();
    expect(within(dialog).queryByRole('navigation', { name: '種類' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'フォルダを出す' }));
    // 一時的に出した左の列も、境目で幅を変えられる
    expect(within(dialog).getByRole('separator', { name: /種類/ })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /ピン止めする/ }));
    expect(useSettingsStore.getState().dialogPanePins['llm-storage:directory']).toBe(true);
    expect(within(dialog).getByRole('navigation', { name: '種類' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /ピン止めをやめる/ }));
    expect(useSettingsStore.getState().dialogPanePins['llm-storage:directory']).toBeUndefined();
    expect(within(dialog).queryByRole('navigation', { name: '種類' })).toBeNull();
  });
});

describe('今の場所', () => {
  it('全体 › 見出し › 種類と出し、押すとそこへ戻る', async () => {
    const dialog = await openDialog();
    await choose(dialog, '埋め込みモデル');
    const crumbs = within(dialog).getByRole('navigation', { name: '今の場所' });
    expect(crumbs.textContent).toBe('全体LLM埋め込みモデル');
    fireEvent.click(within(crumbs).getByRole('button', { name: 'LLM' }));
    expect(within(crumbs).getByText('LLM').getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(crumbs).getByRole('button', { name: '全体' }));
    expect(await within(dialog).findByText(/^ブラウザの合計/)).toBeTruthy();
  });
});

describe('削除と適用', () => {
  it('アバターもバックアップする種類で、バックアップの欄を出す', async () => {
    const dialog = await openDialog();
    await choose(dialog, 'アバター');
    const list = await within(dialog).findByRole('list', { name: '中身' });
    expect(within(list).getByText('バックアップ')).toBeTruthy();
  });

  it('どの種類も列の見出しの上に件数と大きさを出し、バックアップしない種類には欄を出さない', async () => {
    const dialog = await openDialog();
    await choose(dialog, '埋め込みモデル');
    const list = await within(dialog).findByRole('list', { name: '中身' });
    expect(within(list).getByText('ブラウザ')).toBeTruthy();
    expect(within(list).queryByText('バックアップ')).toBeNull();
    const summary = within(dialog).getByText('1 件 · 約 2.0 KB');
    // 情報は列の見出し（一覧）より前
    expect(summary.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 帯には件数・全部戻すを出さず、右端の読み直すの左に全て削除を置く
    const band = within(dialog).getByRole('toolbar', { name: '種類の操作' });
    expect(within(band).queryByText(/件 · 約/)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: '全部戻す' })).toBeNull();
    expect(band.lastElementChild?.getAttribute('aria-label')).toBe('読み直す');
    expect(band.lastElementChild?.previousElementSibling?.textContent).toBe('全て削除');
    // 時刻と大きさは狭くしても隠さないので、情報アイコンは無い
    expect(within(list).queryByRole('button', { name: /の詳細$/ })).toBeNull();
  });

  it('localStorage は IndexedDB の合計と同じ形の表にし、大きさ・生データ・削除を並べる', async () => {
    localStorage.setItem(SETTINGS_KEY, '{"a":1}');
    const dialog = await openDialog();
    await choose(dialog, 'localStorage');
    const table = await within(dialog).findByRole('table', { name: '中身' });
    expect(within(table).getByRole('columnheader', { name: '大きさ' })).toBeTruthy();
    expect(within(table).getByRole('button', { name: '削除 設定' })).toBeTruthy();
    fireEvent.click(within(table).getByRole('button', { name: '「設定」の生データ' }));
    expect(await screen.findByText(/"a": 1/)).toBeTruthy();
  });

  it('エクスポートは、全て削除の左に置き、1 行 1 件の JSON を gzip で縮めたファイルにする', async () => {
    localStorage.setItem(SETTINGS_KEY, '{"a":1}');
    const dialog = await openDialog();
    await choose(dialog, 'localStorage');
    const band = within(dialog).getByRole('toolbar', { name: '種類の操作' });
    const exporter = await within(band).findByRole('button', {
      name: 'エクスポート',
    });
    expect(exporter.nextElementSibling?.textContent).toBe('全て削除');
    await act(async () => {
      fireEvent.click(exporter);
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0] ?? [];
    const values = await readStorageExport(blob!, { area: 'local' }, new Set([SETTINGS_KEY]));
    expect(values.get(SETTINGS_KEY)).toEqual({ a: 1 });
    expect(name).toMatch(/^kisaraui-local-\d{8}-\d{4}\.jsonl\.gz$/);
  });

  it('アバター・埋め込みモデル・ノード定義・編集ワークフローにはエクスポートも開くアイコンも出さない', async () => {
    const dialog = await openDialog();
    await choose(dialog, '埋め込みモデル');
    await within(dialog).findByRole('list', { name: '中身' });
    expect(within(dialog).queryByRole('button', { name: 'エクスポート' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'ファイルを開く' })).toBeNull();
    for (const name of ['アバター', 'ノード定義', '編集ワークフロー']) {
      await choose(dialog, name);
      expect(within(dialog).queryByRole('button', { name: 'エクスポート' })).toBeNull();
      expect(within(dialog).queryByRole('button', { name: 'ファイルを開く' })).toBeNull();
    }
  });

  it('書き出したファイルを開くと、バックアップの列をファイルにし、適用でファイルの中身に戻す', async () => {
    localStorage.setItem(SETTINGS_KEY, '{"a":1}');
    const dialog = await openDialog();
    await choose(dialog, 'localStorage');
    await within(dialog).findByRole('button', { name: 'ファイルを開く' });
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]');
    const picked = new File(
      [await exportedFile('local', { [SETTINGS_KEY]: { a: 2 } })],
      'local.json',
    );
    await act(async () => {
      fireEvent.change(input!, { target: { files: [picked] } });
      await Promise.resolve();
    });
    // localStorage でも、ファイルを開いている間はバックアップの列を出し、見出しの代わりにファイルの名前と外すアイコン
    const list = await within(dialog).findByRole('list', { name: '中身' });
    expect(within(list).getByText('local.json')).toBeTruthy();
    expect(within(list).getByRole('button', { name: 'ファイルを外す' })).toBeTruthy();
    // 生データは、ファイルをもう一度流れで読んでその 1 件だけを出す
    fireEvent.click(within(list).getByRole('button', { name: '「設定」のファイルの生データ' }));
    expect(await screen.findByText(/"a": 2/)).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: '「設定」をバックアップから戻す' }));
    // ブラウザにある 1 件へ戻すのは上書きなので、左の列に ＋ と − の両方を数える
    fireEvent.click(within(dialog).getByRole('button', { name: 'フォルダを出す' }));
    const nav = within(dialog).getByRole('navigation', { name: '種類' });
    const local = within(nav).getByRole('button', { name: /^localStorage/ });
    expect(local.textContent).toContain('+1');
    expect(local.textContent).toContain('−1');
    await apply(dialog);
    // 戻すときにファイルを流れで読み直すので、書き換わるのを待つ
    await vi.waitFor(() => expect(localStorage.getItem(SETTINGS_KEY)).toBe('{"a":2}'));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('ファイルの 1 件が上限（32 MB）を超えれば、適用しても戻さずにその数を知らせる', async () => {
    localStorage.setItem(SETTINGS_KEY, '{"a":1}');
    const added = vi.spyOn(toastManager, 'add');
    const dialog = await openDialog();
    await choose(dialog, 'localStorage');
    await within(dialog).findByRole('button', { name: 'ファイルを開く' });
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]');
    // 33 MB の文字を入れた 1 件（実物の gzip の書き出しファイル）
    const huge = { a: 'x'.repeat(33 * 1024 * 1024) };
    const picked = new File([await exportedFile('local', { [SETTINGS_KEY]: huge })], 'big.json');
    await act(async () => {
      fireEvent.change(input!, { target: { files: [picked] } });
      await Promise.resolve();
    });
    const list = await within(dialog).findByRole('list', { name: '中身' });
    fireEvent.click(within(list).getByRole('button', { name: '「設定」をバックアップから戻す' }));
    await apply(dialog);
    await vi.waitFor(() => {
      const titles = added.mock.calls.map(([options]) => options.title);
      const hit = titles.some(
        (title) => typeof title === 'string' && title.includes('大きすぎるので 1 件を'),
      );
      expect(hit).toBe(true);
    });
    expect(localStorage.getItem(SETTINGS_KEY)).toBe('{"a":1}');
    expect(reloadPage).not.toHaveBeenCalled();
    added.mockRestore();
  });

  it('ほかの種類の書き出しは開かない', async () => {
    const added = vi.spyOn(toastManager, 'add');
    const dialog = await openDialog();
    await choose(dialog, 'localStorage');
    await within(dialog).findByRole('button', { name: 'ファイルを開く' });
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]');
    const other = { format: 'kisaraui-storage-export', version: 1, category: 'session', items: {} };
    await act(async () => {
      fireEvent.change(input!, {
        target: { files: [new File([JSON.stringify(other)], 'x.json')] },
      });
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expect(added).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'この種類のエクスポートとして読めませんでした。' }),
      ),
    );
    added.mockRestore();
    expect(within(dialog).queryByText('x.json')).toBeNull();
  });

  it('1 つの JSON に全件を入れた前の形のファイルは、読めないファイルとして知らせる', async () => {
    const added = vi.spyOn(toastManager, 'add');
    const dialog = await openDialog();
    await choose(dialog, 'localStorage');
    await within(dialog).findByRole('button', { name: 'ファイルを開く' });
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]');
    const old = { format: 'kisaraui-storage-export', version: 1, category: 'local', items: {} };
    const picked = new File([JSON.stringify(old, null, 2)], 'old.json');
    await act(async () => {
      fireEvent.change(input!, { target: { files: [picked] } });
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expect(added).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'この種類のエクスポートとして読めませんでした。' }),
      ),
    );
    added.mockRestore();
    expect(within(dialog).queryByText('old.json')).toBeNull();
  });

  it('中身が無い種類でも、情報と列の見出しを出す', async () => {
    const dialog = await openDialog();
    await choose(dialog, 'ノード定義');
    const list = await within(dialog).findByRole('list', { name: '中身' });
    expect(within(list).getByText('ブラウザ')).toBeTruthy();
    expect(within(list).getByText('何もありません。')).toBeTruthy();
    expect(within(dialog).getByText('0 件 · 約 0 B')).toBeTruthy();
  });

  it('バックアップする種類は、つないでいなければ情報にその旨を出す', async () => {
    const dialog = await openDialog();
    await choose(dialog, 'プリセット');
    const list = await within(dialog).findByRole('list', { name: '中身' });
    expect(within(list).getByText('バックアップ')).toBeTruthy();
    expect(within(dialog).getByText('ComfyUI につなぐとバックアップを見られます。')).toBeTruthy();
  });

  it('削除アイコンは印を付けるだけで、適用で消す。モデルは読み込み直さない', async () => {
    const dialog = await openDialog();
    await choose(dialog, '埋め込みモデル');
    fireEvent.click(await within(dialog).findByRole('button', { name: '削除 org/model' }));
    expect(embedding.removed).toEqual([]);
    // もう一度押すと印を外す
    fireEvent.click(within(dialog).getByRole('button', { name: '削除を取り消す org/model' }));
    expect(within(dialog).getByRole('button', { name: '適用' })).toHaveProperty('disabled', true);
    fireEvent.click(within(dialog).getByRole('button', { name: '削除 org/model' }));
    await apply(dialog);
    expect(embedding.removed).toEqual(['org/model']);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('localStorage の鍵を消して適用すると、ページを読み込み直す', async () => {
    localStorage.setItem(SETTINGS_KEY, '{}');
    const dialog = await openDialog();
    await choose(dialog, 'localStorage');
    fireEvent.click(await within(dialog).findByRole('button', { name: '削除 設定' }));
    expect(localStorage.getItem(SETTINGS_KEY)).toBe('{}');
    await apply(dialog);
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });
});

describe('バックアップの列', () => {
  it('つないでいなければ出さず、その旨を出す', async () => {
    const dialog = await openDialog();
    await choose(dialog, 'システムテンプレート');
    expect(
      await within(dialog).findByText('ComfyUI につなぐとバックアップを見られます。'),
    ).toBeTruthy();
  });

  it('バックアップする種類は列の見出し（ブラウザ・バックアップ）を出し、バックアップにだけある 1 件は下にまとめる', async () => {
    backupTemplates();
    const dialog = await openDialog();
    await choose(dialog, 'システムテンプレート');
    expect(await within(dialog).findByText('バックアップにだけあるもの')).toBeTruthy();
    const list = within(dialog).getByRole('list', { name: '中身' });
    expect(within(list).getByText('ブラウザ')).toBeTruthy();
    expect(within(list).getByText('バックアップ')).toBeTruthy();
    // 件数の情報は「ブラウザ」と書かず、バックアップは括弧で添える
    expect(within(dialog).getByText(/^（バックアップ 2 件 · 約 /)).toBeTruthy();
  });

  it('sessionStorage の下の Comfy バックアップは種類ごとの件数を並べ、押すとその種類へ移る', async () => {
    backupTemplates();
    const dialog = await openDialog();
    await choose(dialog, 'Comfy バックアップ');
    const crumbs = within(dialog).getByRole('navigation', { name: '今の場所' });
    expect(crumbs.textContent).toBe('全体Comfy バックアップ');
    expect(await within(dialog).findByText(/^バックアップの合計: \d+ 件/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'システムテンプレート' }));
    expect(crumbs.textContent).toBe('全体LLMシステムテンプレート');
  });

  it('戻すアイコンは印を付けるだけで、適用でその 1 件だけを戻す', async () => {
    backupTemplates();
    const dialog = await openDialog();
    await choose(dialog, 'システムテンプレート');
    fireEvent.click(
      await within(dialog).findByRole('button', { name: '「Two」をバックアップから戻す' }),
    );
    expect(useSystemPromptsStore.getState().templates).toEqual({});
    expect(
      within(dialog).getByRole('button', { name: '「Two」を戻すのを取り消す' }),
    ).toHaveProperty('ariaPressed', 'true');
    await apply(dialog);
    expect(Object.keys(useSystemPromptsStore.getState().templates)).toEqual(['t2']);
  });

  it('バックアップの欄の生データのアイコンは、接続先のその 1 件の中身を出す', async () => {
    backupTemplates();
    const dialog = await openDialog();
    await choose(dialog, 'システムテンプレート');
    fireEvent.click(
      await within(dialog).findByRole('button', { name: '「Two」のバックアップの生データ' }),
    );
    expect(await screen.findByText(/"id": "t2"/)).toBeTruthy();
  });

  it('バックアップの削除アイコンで印を付け、適用でその控えだけを消す', async () => {
    const removed = backupTemplates();
    const dialog = await openDialog();
    await choose(dialog, 'システムテンプレート');
    fireEvent.click(
      await within(dialog).findByRole('button', { name: '「One」のバックアップを削除' }),
    );
    expect(removed).toEqual([]);
    await apply(dialog);
    expect(removed).toEqual(['system-prompts/t1']);
  });
});

describe('ユーザーフォルダの物', () => {
  /** 実行の記録に 1 つのファイルを置き、つなぐ。消したファイルを返す */
  function userFiles(): string[] {
    const removed: string[] = [];
    installComfyPort({
      ...port,
      // 控えは空にする（作り物の接続先へ取りに行くと、名前の解決が詰まって後のテストが遅れる）
      library: { ...port.library, list: () => Promise.resolve([]) },
      userFiles: {
        list: (_baseUrl, kind) =>
          Promise.resolve(
            kind === 'history' ? [{ path: 'session-1.json', bytes: 2048, modified: 1 }] : [],
          ),
        read: () => Promise.resolve('{"runs":[]}'),
        remove: (_baseUrl, kind, path) => {
          removed.push(`${kind}/${path}`);
          return Promise.resolve();
        },
      },
    });
    connectComfy();
    return removed;
  }

  it('ComfyUI の見出しの下に種類を並べ、列の見出しは ComfyUI にする', async () => {
    userFiles();
    const dialog = await openDialog();
    await choose(dialog, '実行の記録');
    expect(await within(dialog).findByText('session-1.json')).toBeTruthy();
    const list = within(dialog).getByRole('list', { name: '中身' });
    expect(within(list).getByText('ComfyUI')).toBeTruthy();
    expect(within(list).queryByText('ブラウザ')).toBeNull();
    // ブラウザの物ではないので、書き出しも開くアイコンも出さない
    expect(within(dialog).queryByRole('button', { name: 'エクスポート' })).toBeNull();
  });

  it('削除の印を付けて適用すると、接続先のそのファイルを消す', async () => {
    const removed = userFiles();
    const dialog = await openDialog();
    await choose(dialog, '実行の記録');
    fireEvent.click(await within(dialog).findByRole('button', { name: '削除 session-1.json' }));
    expect(removed).toEqual([]);
    await apply(dialog);
    expect(removed).toEqual(['history/session-1.json']);
  });

  it('つないでいなければ、件数の代わりにその旨を出す', async () => {
    const dialog = await openDialog();
    await choose(dialog, 'モデルのメモ');
    expect(
      await within(dialog).findByText('ComfyUI につなぐとユーザーフォルダの中身を見られます。'),
    ).toBeTruthy();
  });
});
describe('クリーンアップ', () => {
  it('Comfy バックアップの下に元の無いバックアップを数え、印を付けて適用でまとめて消す', async () => {
    const removed = backupTemplates();
    const dialog = await openDialog();
    await choose(dialog, 'Comfy バックアップ');
    const section = await within(dialog).findByRole('region', { name: 'クリーンアップ' });
    expect(within(section).getByText(/^ブラウザに元の無いバックアップ: 2 件/)).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: '削除の印を付ける' }));
    // もう一度押すと外せる
    expect(within(section).getByRole('button', { name: '印を外す' })).toBeTruthy();
    await apply(dialog);
    expect(removed.sort()).toEqual(['system-prompts/t1', 'system-prompts/t2']);
  });

  it('古いバックアップの知らせの「確認する」で、Comfy バックアップの場所を開く', async () => {
    backupTemplates();
    render(<Field />);
    act(() => useStorageDialogStore.getState().notifyStale());
    const notice = await screen.findByRole('alertdialog');
    expect(
      within(notice).getByText('古いバックアップデータが残っています。確認しますか？'),
    ).toBeTruthy();
    fireEvent.click(within(notice).getByRole('button', { name: '確認する' }));
    const dialog = await screen.findByRole('dialog');
    const crumbs = within(dialog).getByRole('navigation', { name: '今の場所' });
    expect(crumbs.textContent).toBe('全体Comfy バックアップ');
    expect(await within(dialog).findByRole('region', { name: 'クリーンアップ' })).toBeTruthy();
  });
});

describe('漏れ', () => {
  it('開け閉めを繰り返しても、閉じたダイアログを残さない', async () => {
    const leak = leakWatch();
    render(<Field />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'ストレージの管理' }));
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
