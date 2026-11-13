// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import type { Avatar } from '@/chat/types';
import { AvatarPickerDialog } from '@/components/llm/dialogs/AvatarPickerDialog';
import { DialogTrigger } from '@/components/ui/dialog';
import { memoryTable } from '@/store/persist/chat-repo';
import { installAvatarTable, useAvatarsStore } from '@/store/use-avatars-store';
import { installPresetTable, usePresetsStore } from '@/store/use-presets-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

// ─────────────────────────────
// アバターの画像の管理。表の画像を並べ、決定で id を返し、消すときは
// 確かめずに表から消す（プリセットのリンクは残す）
// ─────────────────────────────

const avatar = (id: string, name: string): Avatar => ({
  id,
  name,
  image: new Blob([id], { type: 'image/png' }),
  hash: id,
  createdAt: 0,
});

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  installAvatarTable(memoryTable());
  installPresetTable(memoryTable());
  useAvatarsStore.setState({
    avatars: { a1: avatar('a1', 'Alice'), a2: avatar('a2', 'Bob') },
    loaded: true,
  });
  usePresetsStore.setState({ presets: {}, loaded: true });
});

afterEach(() => {
  cleanup();
  installAvatarTable(null);
  installPresetTable(null);
  useSettingsStore.setState({ dialogLayouts: {} });
});

function open(onPlace = vi.fn()): ReturnType<typeof vi.fn> {
  render(
    <AvatarPickerDialog trigger={<DialogTrigger>開く</DialogTrigger>} value="" onPlace={onPlace} />,
  );
  fireEvent.click(screen.getByRole('button', { name: '開く' }));
  return onPlace;
}

describe('選ぶ', () => {
  it('表の画像をカードで並べ、ダブルクリックでその id を返す', async () => {
    const onPlace = open();
    const card = await screen.findByTitle('Bob');
    expect(screen.getByTitle('Alice')).toBeTruthy();
    fireEvent.doubleClick(card);
    expect(onPlace).toHaveBeenCalledWith('a2');
  });
});

describe('なし', () => {
  it('先頭に「なし」のカードを置き、画像が無ければ ✓ を付け、決定すると null を返す', async () => {
    const onPlace = open();
    const cards = await screen.findAllByRole('button', { pressed: false });
    const none = screen.getByTitle('なし');
    expect(cards.indexOf(none)).toBeLessThan(cards.indexOf(screen.getByTitle('Alice')));
    // 今の値の印（読み上げ用の文）が「なし」に付く
    expect(none.querySelector('.sr-only')).not.toBeNull();
    fireEvent.doubleClick(none);
    expect(onPlace).toHaveBeenCalledWith(null);
  });
});

describe('消す', () => {
  it('確かめずに表から消し、使っているプリセットのリンクは変えない', async () => {
    const used = usePresetsStore.getState().add('P', EMPTY_CHARACTER, 'a1', []);
    open();
    fireEvent.click(await screen.findByTitle('Alice'));
    fireEvent.click(screen.getByRole('button', { name: '画像を消す' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useAvatarsStore.getState().avatars.a1).toBeUndefined();
    await waitFor(() => expect(screen.queryByTitle('Alice')).toBeNull());
    expect(usePresetsStore.getState().presets[used.id]?.imageId).toBe('a1');
  });
});

describe('漏れ', () => {
  it('開け閉めを繰り返しても、閉じたダイアログを残さない', async () => {
    const leak = leakWatch();
    render(
      <AvatarPickerDialog
        trigger={<DialogTrigger>開く</DialogTrigger>}
        value=""
        onPlace={vi.fn()}
      />,
    );

    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '開く' }));
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
