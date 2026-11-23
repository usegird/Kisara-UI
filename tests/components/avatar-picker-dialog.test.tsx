// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import type { Avatar } from '@/chat/types';
import { AvatarPickerDialog } from '@/components/llm/dialogs/AvatarPickerDialog';
import { DialogTrigger } from '@/components/ui/dialog';
import { buildPng, createZtxtChunk } from '@/lib/png-chunks';
import { memoryTable } from '@/store/persist/chat-repo';
import { useAvatarExpressionsStore } from '@/store/use-avatar-expressions-store';
import { installAvatarTable, useAvatarsStore } from '@/store/use-avatars-store';
import { installPresetTable, usePresetsStore } from '@/store/use-presets-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

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
  useAvatarExpressionsStore.setState({ reads: {}, marks: {} });
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
    expect(none.querySelector('.sr-only')).not.toBeNull();
    fireEvent.doubleClick(none);
    expect(onPlace).toHaveBeenCalledWith(null);
  });
});

describe('消す', () => {
  it('確かめてから表から消し、使っているプリセットのリンクは変えない', async () => {
    const used = usePresetsStore.getState().add('P', EMPTY_CHARACTER, 'a1', []);
    open();
    fireEvent.click(await screen.findByTitle('Alice'));
    fireEvent.click(screen.getByRole('button', { name: '画像を消す' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm.textContent).toContain('Alice');
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(useAvatarsStore.getState().avatars.a1).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '画像を消す' }));
    fireEvent.click(await screen.findByRole('button', { name: '削除する' }));
    expect(useAvatarsStore.getState().avatars.a1).toBeUndefined();
    await waitFor(() => expect(screen.queryByTitle('Alice')).toBeNull());
    expect(usePresetsStore.getState().presets[used.id]?.imageId).toBe('a1');
  });
});

describe('カードの操作', () => {
  it('名前の右端の鉛筆で名前を変え、空ならやめる。「なし」には鉛筆も表情のアイコンも出さない', async () => {
    open();
    await screen.findByTitle('Alice');
    expect(screen.queryByRole('button', { name: 'なし の名前を変える' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /の表情を編集$/u })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Alice の名前を変える' }));
    const field = screen.getByRole('textbox', { name: 'Alice の名前を変える' });
    fireEvent.change(field, { target: { value: ' ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(useAvatarsStore.getState().avatars.a1?.name).toBe('Alice');
    fireEvent.change(field, { target: { value: ' Carol ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(useAvatarsStore.getState().avatars.a1?.name).toBe('Carol');
  });

  it('表情のアイコンは、表情差分を持つアバターではいつも出し、持たなければ指したときだけ出す', async () => {
    const withExpressions = new Blob(
      [
        buildPng([
          { type: 'IHDR', data: new Uint8Array(13) },
          await createZtxtChunk('kisara-expressions', '{}'),
          { type: 'IEND', data: new Uint8Array(0) },
        ]),
      ],
      { type: 'image/png' },
    );
    useAvatarsStore.setState({
      avatars: {
        a1: { ...avatar('a1', 'Alice'), image: withExpressions },
        a2: avatar('a2', 'Bob'),
      },
    });
    open();
    const alice = await screen.findByRole('button', { name: 'Alice の表情を編集' });
    await waitFor(() => expect(alice.className).not.toContain('opacity-0'));
    expect(screen.getByRole('button', { name: 'Bob の表情を編集' }).className).toContain(
      'opacity-0',
    );
  });

  it('名前を変えても並べ直さず、開き直すと名前順に並べる', async () => {
    open();
    await screen.findByTitle('Alice');
    const names = (): string[] =>
      screen
        .getAllByRole('button', { pressed: false })
        .map((card) => card.getAttribute('title') ?? '')
        .filter((title) => title === 'Bob' || title === 'Alice' || title === 'Zed');
    expect(names()).toEqual(['Alice', 'Bob']);
    fireEvent.click(screen.getByRole('button', { name: 'Alice の名前を変える' }));
    const field = screen.getByRole('textbox', { name: 'Alice の名前を変える' });
    fireEvent.change(field, { target: { value: 'Zed' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(names()).toEqual(['Zed', 'Bob']);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    await screen.findByTitle('Zed');
    expect(names()).toEqual(['Bob', 'Zed']);
  });

  it('名前の欄の Esc は欄だけを閉じ、ダイアログは閉じない', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Bob の名前を変える' }));
    const field = screen.getByRole('textbox', { name: 'Bob の名前を変える' });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Bob の名前を変える' })).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
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
