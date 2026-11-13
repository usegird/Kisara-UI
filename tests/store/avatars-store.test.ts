import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import { memoryTable, type ChatTable } from '@/store/persist/chat-repo';
import { installAvatarTable, useAvatarsStore } from '@/store/use-avatars-store';
import { installPresetTable, usePresetsStore } from '@/store/use-presets-store';

// ─────────────────────────────
// アバターの画像の表。中身が同じ画像は足さない・消してもプリセットのリンクは変えない
// ─────────────────────────────

let avatars: ChatTable;
let presets: ChatTable;

beforeEach(() => {
  avatars = memoryTable();
  presets = memoryTable();
  installAvatarTable(avatars);
  installPresetTable(presets);
  useAvatarsStore.setState({ avatars: {}, loaded: false });
  usePresetsStore.setState({ presets: {}, loaded: false });
});

afterEach(() => {
  installAvatarTable(null);
  installPresetTable(null);
});

const png = (text: string): Blob => new Blob([text], { type: 'image/png' });

describe('足す', () => {
  it('中身が同じ画像は足さずに今ある 1 件を返し、違えば足して表にも書く', async () => {
    const store = useAvatarsStore.getState();
    const first = await store.add(png('a'), 'A');
    const again = await store.add(png('a'), 'Other');
    const other = await store.add(png('b'), 'B');
    expect(again.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/u);
    expect((await avatars.keys()).sort()).toEqual([first.id, other.id].sort());
  });

  it('読み込み直すと表から戻る', async () => {
    const added = await useAvatarsStore.getState().add(png('a'), 'A');
    useAvatarsStore.setState({ avatars: {}, loaded: false });
    installAvatarTable(avatars);
    await useAvatarsStore.getState().ensure();
    expect(useAvatarsStore.getState().avatars[added.id]?.name).toBe('A');
  });
});

describe('消す', () => {
  it('画像を消しても、使っているプリセットのリンクは変えない（戻せばまた出る）', async () => {
    const avatar = await useAvatarsStore.getState().add(png('a'), 'A');
    const used = usePresetsStore.getState().add('P', EMPTY_CHARACTER, avatar.id, []);
    useAvatarsStore.getState().remove(avatar.id);
    expect(useAvatarsStore.getState().avatars[avatar.id]).toBeUndefined();
    expect(usePresetsStore.getState().presets[used.id]?.imageId).toBe(avatar.id);
    await useAvatarsStore.getState().restore(avatar);
    expect(useAvatarsStore.getState().avatars[avatar.id]).toBeDefined();
  });

  it('プリセットを消しても画像は残る', async () => {
    const avatar = await useAvatarsStore.getState().add(png('a'), 'A');
    const preset = usePresetsStore.getState().add('P', EMPTY_CHARACTER, avatar.id, []);
    usePresetsStore.getState().remove(preset.id);
    expect(useAvatarsStore.getState().avatars[avatar.id]).toBeDefined();
  });
});
