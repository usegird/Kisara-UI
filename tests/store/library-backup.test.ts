import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import type { LibraryBackupPort, LibraryKind } from '@/port/comfy-port';
import { memoryTable } from '@/store/persist/chat-repo';
import {
  backupLibraryItem,
  restoreLibrary,
  startLibraryBackup,
} from '@/store/persist/library-backup';
import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import { avatarImageOf, installAvatarTable, useAvatarsStore } from '@/store/use-avatars-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { installDictionaryTable, useDictionariesStore } from '@/store/use-dictionaries-store';
import { installPlaybookTable, usePlaybooksStore } from '@/store/use-playbooks-store';
import { installPresetTable, usePresetsStore } from '@/store/use-presets-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { installSystemPromptTable, useSystemPromptsStore } from '@/store/use-system-prompts-store';

import { connectComfy } from '../helpers/connection';
import { chatPlaybook, loreEntry } from '../helpers/llm';

// ─────────────────────────────
// プリセットとテンプレートの控え。ユーザーフォルダは作り物にする。
// ─────────────────────────────

/** ユーザーフォルダの代わり。`<種類>/<id>` から本文と画像へ */
function fakeLibrary(files: Map<string, { body: string; image: Blob | null }>): LibraryBackupPort {
  const key = (kind: LibraryKind, id: string): string => `${kind}/${id}`;
  return {
    list: (_baseUrl, kind) =>
      Promise.resolve(
        [...files.entries()]
          .filter(([name]) => name.startsWith(`${kind}/`))
          .map(([, file]) => JSON.parse(file.body) as unknown),
      ),
    save: (_baseUrl, { kind, id, body, image }) => {
      files.set(key(kind, id), { body, image });
      return Promise.resolve();
    },
    fetchImage: (_baseUrl, kind, id) => Promise.resolve(files.get(key(kind, id))?.image ?? null),
    remove: (_baseUrl, kind, id) => {
      files.delete(key(kind, id));
      return Promise.resolve();
    },
  };
}

let files: Map<string, { body: string; image: Blob | null }>;
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  files = new Map();
  installComfyPort({ ...comfyPort(), library: fakeLibrary(files) });
  installPresetTable(memoryTable());
  installSystemPromptTable(memoryTable());
  installDictionaryTable(memoryTable());
  usePresetsStore.setState({ presets: {}, loaded: true });
  useDictionariesStore.setState({ dictionaries: {}, loaded: true });
  useSystemPromptsStore.setState({ templates: {} });
  installPlaybookTable(memoryTable());
  usePlaybooksStore.setState({ playbooks: {}, loaded: true });
  stop = startLibraryBackup();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  useSettingsStore.setState({ chatComfyBackup: false, baseUrl: '' });
  useConnectionStore.setState({ status: 'disconnected' });
  installPresetTable(null);
  installSystemPromptTable(null);
  installDictionaryTable(null);
});

describe('控えを書く', () => {
  it('変えてから間を置いて、その 1 件だけを書く。一覧から消しても控えは残す', async () => {
    connectComfy({ chatComfyBackup: true });
    const template = useSystemPromptsStore.getState().add('t', 'body');
    expect(files.size).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(JSON.parse(files.get(`system-prompts/${template.id}`)?.body ?? '{}')).toMatchObject({
      v: 1,
      name: 't',
      content: 'body',
    });
    useSystemPromptsStore.getState().remove(template.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(files.has(`system-prompts/${template.id}`)).toBe(true);
  });

  it('プリセットは画像を一緒に書き、本文には画像を入れない', async () => {
    connectComfy({ chatComfyBackup: true });
    const image = new Blob(['png'], { type: 'image/png' });
    const preset = await usePresetsStore.getState().addCard({ name: 'Rei' }, image);
    await vi.advanceTimersByTimeAsync(2000);
    const file = files.get(`presets/${preset.id}`);
    expect(file?.image).toBe(image);
    expect(JSON.parse(file?.body ?? '{}')).not.toHaveProperty('image');
  });

  it('設定を外していれば書かない。つないでいない間の 1 件は、つないだときに書く', async () => {
    connectComfy({ chatComfyBackup: false });
    useSystemPromptsStore.getState().add('off', '');
    await vi.advanceTimersByTimeAsync(2000);
    expect(files.size).toBe(0);

    useSettingsStore.setState({ chatComfyBackup: true });
    useConnectionStore.setState({ status: 'disconnected' });
    useSystemPromptsStore.getState().add('later', '');
    await vi.advanceTimersByTimeAsync(2000);
    expect(files.size).toBe(0);
    useConnectionStore.setState({ status: 'connected' });
    await vi.advanceTimersByTimeAsync(0);
    // 設定を入れる前に足した 1 件はまとめて書かない
    expect(
      [...files.values()].map((file) => (JSON.parse(file.body) as { name: string }).name),
    ).toEqual(['later']);
  });
});

describe('今すぐ控えを書く（ストレージの管理のバックアップ取得）', () => {
  it('設定を外していても、つないでいればその 1 件を書く。無い id・つないでいないときは false', async () => {
    connectComfy({ chatComfyBackup: false });
    const template = useSystemPromptsStore.getState().add('now', 'body');
    expect(await backupLibraryItem('system-prompts', template.id)).toBe(true);
    expect(files.has(`system-prompts/${template.id}`)).toBe(true);
    expect(await backupLibraryItem('system-prompts', 'missing')).toBe(false);
    useConnectionStore.setState({ status: 'disconnected' });
    expect(await backupLibraryItem('system-prompts', template.id)).toBe(false);
  });
});

describe('控えから戻す', () => {
  const body = (id: string, name: string, updatedAt: number): string =>
    JSON.stringify({ v: 1, id, name, content: 'remote', createdAt: 1, updatedAt });

  it('テンプレートだけを id で突き合わせ、無ければ足し、両方にあれば新しい方を残す', async () => {
    connectComfy({ chatComfyBackup: true });
    const older = useSystemPromptsStore.getState().add('older', 'mine');
    const newer = useSystemPromptsStore.getState().add('newer', 'mine');
    await vi.advanceTimersByTimeAsync(2000);
    files.set(`system-prompts/${older.id}`, {
      body: body(older.id, 'remote', older.updatedAt + 1),
      image: null,
    });
    files.set(`system-prompts/${newer.id}`, { body: body(newer.id, 'remote', 1), image: null });
    files.set('system-prompts/abc', { body: body('abc', 'restored', 1), image: null });
    files.set('presets/p1', { body: JSON.stringify({ id: 'p1', card: {} }), image: null });

    const saves = vi.spyOn(comfyPort().library, 'save');
    expect(await restoreLibrary('system-prompts')).toEqual({ added: 1, updated: 1, failed: false });
    const { templates } = useSystemPromptsStore.getState();
    expect([templates[older.id]?.content, templates[newer.id]?.content]).toEqual([
      'remote',
      'mine',
    ]);
    expect(templates.abc?.name).toBe('restored');
    // プリセットは別のボタン
    expect(usePresetsStore.getState().presets.p1).toBeUndefined();
    // 戻した 1 件を控えに書き戻さない
    await vi.advanceTimersByTimeAsync(2000);
    expect(saves).not.toHaveBeenCalled();
  });

  it('id を渡すとその 1 件だけを戻す（ストレージの管理）', async () => {
    connectComfy({ chatComfyBackup: true });
    files.set('system-prompts/a', { body: body('a', 'A', 1), image: null });
    files.set('system-prompts/b', { body: body('b', 'B', 1), image: null });
    expect(await restoreLibrary('system-prompts', 'b')).toEqual({
      added: 1,
      updated: 0,
      failed: false,
    });
    expect(Object.keys(useSystemPromptsStore.getState().templates)).toEqual(['b']);
  });

  it('プリセットは画像も一緒に戻す', async () => {
    connectComfy({ chatComfyBackup: true });
    const fields = { ...EMPTY_CHARACTER, name: 'P' };
    const body = JSON.stringify({ v: 7, id: 'p1', name: 'P', fields, lorebooks: [], updatedAt: 1 });
    files.set('presets/p1', { body, image: new Blob(['x']) });
    expect(await restoreLibrary('presets')).toEqual({ added: 1, updated: 0, failed: false });
    // 画像はアバターの表へ移し、プリセットは id で指す
    const imageId = usePresetsStore.getState().presets.p1?.imageId;
    expect(avatarImageOf(imageId)).not.toBeNull();
  });
});

describe('プリセットの上書きと別名保存', () => {
  it('上書きは会話の画像と辞書も書いて版が進み、別名保存は同じ画像と辞書の中身の 1 件を足す', async () => {
    connectComfy({ chatComfyBackup: true });
    const fields = { ...EMPTY_CHARACTER, name: 'Rei' };
    const book = { id: 'b1', name: 'Book', entries: [loreEntry({ content: 'Lore.' })] };
    const preset = usePresetsStore.getState().add('Rei', fields, 'a1', []);
    await vi.advanceTimersByTimeAsync(5);
    // 会話で切った印はプリセットに書かない
    const refs = { imageId: 'a2', lorebooks: [{ ...book, off: true as const }] };
    usePresetsStore.getState().update(preset.id, 'Rei 2', fields, refs);
    const renamed = usePresetsStore.getState().presets[preset.id];
    expect(renamed).toMatchObject({ name: 'Rei 2', imageId: 'a2', lorebooks: [book] });
    expect(renamed?.lorebooks[0]).not.toHaveProperty('off');
    expect(renamed?.updatedAt).toBeGreaterThan(preset.updatedAt);
    // 控えには辞書の並びの中身を書く（版 7）
    await vi.advanceTimersByTimeAsync(2000);
    const body = JSON.parse(files.get(`presets/${preset.id}`)?.body ?? '{}') as object;
    expect(body).toMatchObject({ v: 7, lorebooks: [book] });

    const copy = usePresetsStore.getState().add('Copy', fields, 'a2', [book]);
    expect(copy.id).not.toBe(preset.id);
    expect(copy).toMatchObject({ name: 'Copy', imageId: 'a2', lorebooks: [book] });
  });
});
describe('追加辞書とロアブックの控え', () => {
  it('辞書を書き、一覧から消しても控えは残す', async () => {
    connectComfy({ chatComfyBackup: true });
    const { dictionary } = useDictionariesStore
      .getState()
      .adopt('slang', [loreEntry({ keys: ['k'], content: 'C.' })]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(JSON.parse(files.get(`dictionaries/${dictionary.id}`)?.body ?? '{}')).toMatchObject({
      v: 1,
      name: 'slang',
    });
    useDictionariesStore.getState().remove(dictionary.id);
    await vi.advanceTimersByTimeAsync(2000);
    expect(files.has(`dictionaries/${dictionary.id}`)).toBe(true);
  });

  it('辞書を戻す', async () => {
    connectComfy({ chatComfyBackup: true });
    const entries = [loreEntry({ keys: ['k'], content: 'C.' })];
    files.set('dictionaries/d1', {
      body: JSON.stringify({ v: 1, id: 'd1', name: 'D', entries, updatedAt: 1 }),
      image: null,
    });
    expect(await restoreLibrary('dictionaries')).toEqual({ added: 1, updated: 0, failed: false });
    expect(useDictionariesStore.getState().dictionaries.d1?.name).toBe('D');
  });

  it('上限（32 MB）を超える 1 件は戻さず、その数を返す', async () => {
    connectComfy({ chatComfyBackup: true });
    const entries = [loreEntry({ keys: ['k'], content: 'x'.repeat(33 * 1024 * 1024) })];
    files.set('dictionaries/big', {
      body: JSON.stringify({ v: 1, id: 'big', name: 'Big', entries, updatedAt: 1 }),
      image: null,
    });
    expect(await restoreLibrary('dictionaries')).toEqual({
      added: 0,
      updated: 0,
      failed: false,
      tooLarge: 1,
    });
    expect(useDictionariesStore.getState().dictionaries.big).toBeUndefined();
  });

  it('自分のプレイブックは kisara/playbooks に書き、消しても控えは残し、戻すと新しい方を残す', async () => {
    connectComfy({ chatComfyBackup: true });
    const item = usePlaybooksStore.getState().add(chatPlaybook().playbook);
    await vi.advanceTimersByTimeAsync(2000);
    const saved = JSON.parse(files.get(`playbooks/${item.id}`)?.body ?? '{}') as {
      playbook?: { origin?: string };
    };
    expect(saved.playbook?.origin).toBe('own');

    usePlaybooksStore.getState().remove(item.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(files.has(`playbooks/${item.id}`)).toBe(true);

    files.set('playbooks/r1', {
      body: JSON.stringify({ id: 'r1', playbook: chatPlaybook().playbook, updatedAt: 5 }),
      image: null,
    });
    // 消した 1 件も控えに残っているので、一緒に戻る
    expect(await restoreLibrary('playbooks')).toEqual({ added: 2, updated: 0, failed: false });
    expect(usePlaybooksStore.getState().playbooks.r1?.playbook).toMatchObject({
      id: 'r1',
      origin: 'own',
    });
  });
});
describe('アバターの控え', () => {
  beforeEach(() => {
    installAvatarTable(memoryTable());
    useAvatarsStore.setState({ avatars: {}, loaded: true });
  });

  afterEach(() => {
    installAvatarTable(null);
  });

  it('足したアバターを画像と一緒に書き、一覧から消しても控えは残す', async () => {
    connectComfy({ chatComfyBackup: true });
    const image = new Blob(['jpg'], { type: 'image/jpeg' });
    const avatar = await useAvatarsStore.getState().add(image, 'Rei');
    await vi.advanceTimersByTimeAsync(2000);
    const file = files.get(`avatars/${avatar.id}`);
    expect(file?.image).toBe(image);
    expect(JSON.parse(file?.body ?? '{}')).toMatchObject({
      v: 1,
      name: 'Rei',
      hash: avatar.hash,
      type: 'image/jpeg',
    });
    useAvatarsStore.getState().remove(avatar.id);
    await vi.advanceTimersByTimeAsync(2000);
    expect(files.has(`avatars/${avatar.id}`)).toBe(true);
  });

  it('戻すと画像の種類も戻し、同じ id・同じ中身の画像は足さない', async () => {
    connectComfy({ chatComfyBackup: true });
    const body = (id: string, hash: string): string =>
      JSON.stringify({ v: 1, id, name: id, hash, type: 'image/webp', createdAt: 1 });
    files.set('avatars/a1', { body: body('a1', 'h1'), image: new Blob(['one']) });
    files.set('avatars/a2', { body: body('a2', 'h2'), image: new Blob(['two']) });
    const kept = { id: 'k1', name: 'K', image: new Blob(['two']), hash: 'h2', createdAt: 1 };
    useAvatarsStore.setState({ avatars: { k1: kept } });
    expect(await restoreLibrary('avatars')).toEqual({ added: 1, updated: 0, failed: false });
    expect(useAvatarsStore.getState().avatars.a1?.image.type).toBe('image/webp');
    expect(useAvatarsStore.getState().avatars.a2).toBeUndefined();
    expect(await restoreLibrary('avatars', 'a1')).toEqual({ added: 0, updated: 0, failed: false });
  });
});
