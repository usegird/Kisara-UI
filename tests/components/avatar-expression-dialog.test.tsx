// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PRESET_EXPRESSION_LABELS, readExpressionSet } from '@/chat/avatar-expression';
import type { Avatar } from '@/chat/types';
import { AvatarExpressionDialog } from '@/components/llm/dialogs/AvatarExpressionDialog';
import { memoryTable } from '@/store/persist/chat-repo';
import { useAvatarExpressionsStore } from '@/store/use-avatar-expressions-store';
import { installAvatarTable, useAvatarsStore } from '@/store/use-avatars-store';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { chat, chatMessage } from '../helpers/llm';
import { minimalPngBlob } from '../helpers/png';

vi.mock('@/lib/digest', () => ({
  sha256Hex: (blob: Blob) => Promise.resolve(`size-${String(blob.size)}`),
}));

const avatar: Avatar = {
  id: 'a1',
  name: 'Alice',
  image: minimalPngBlob(),
  hash: 'h1',
  createdAt: 0,
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  installAvatarTable(memoryTable());
  useAvatarsStore.setState({ avatars: { a1: avatar }, loaded: true });
  useAvatarExpressionsStore.setState({ reads: {} });
});

afterEach(() => {
  cleanup();
  installAvatarTable(null);
  useSettingsStore.setState({ dialogLayouts: {} });
});

function open(onClose = vi.fn()): ReturnType<typeof vi.fn> {
  render(<AvatarExpressionDialog avatarId="a1" onClose={onClose} />);
  return onClose;
}

describe('開く', () => {
  it('表情差分の無いアバターは、今の画像を既定の表情 neutral のカード 1 枚で出す', async () => {
    open();
    const card = await screen.findByTitle('neutral');
    const star = screen.getByRole('button', { name: 'neutral は既定の表情' });
    expect(star.getAttribute('aria-pressed')).toBe('true');
    expect(card.querySelector('.sr-only')).toBeNull();
    expect(screen.getByRole('button', { name: '消す' })).toHaveProperty('disabled', true);
    fireEvent.click(card);
    expect(screen.getByRole('button', { name: '消す' })).toHaveProperty('disabled', true);
  });
});

async function savedLabels(expected: readonly string[]): Promise<void> {
  await waitFor(async () => {
    const saved = useAvatarsStore.getState().avatars.a1;
    const read = saved === undefined ? null : await readExpressionSet(saved.image);
    expect(read?.kind === 'ok' && read.set.items.map((item) => item.label)).toEqual(expected);
  });
}

describe('取り込む', () => {
  it('ファイル名をラベルにして足し、すぐ同じ id の PNG に表情を書く', async () => {
    open();
    await screen.findByTitle('neutral');
    const input = document.querySelector<HTMLInputElement>('input[type="file"][multiple]');
    const joy = new File(['j'], 'joy.webp', { type: 'image/webp' });
    await act(async () => {
      if (input !== null) fireEvent.change(input, { target: { files: [joy] } });
      await Promise.resolve();
    });
    await screen.findByTitle('joy');
    expect(screen.queryByText(/件を足し/u)).toBeNull();
    await savedLabels(['neutral', 'joy']);
  });
});

describe('消す', () => {
  it('表情の名前を出して確かめてから消し、すぐ書く', async () => {
    open();
    await screen.findByTitle('neutral');
    const input = document.querySelector<HTMLInputElement>('input[type="file"][multiple]');
    await act(async () => {
      const joy = new File(['j'], 'joy.webp', { type: 'image/webp' });
      if (input !== null) fireEvent.change(input, { target: { files: [joy] } });
      await Promise.resolve();
    });
    await savedLabels(['neutral', 'joy']);
    fireEvent.click(screen.getByRole('button', { name: '消す' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm.textContent).toContain('joy');
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    await waitFor(() => expect(screen.queryByTitle('joy')).toBeNull());
    await savedLabels(['neutral']);
  });
});

describe('決定', () => {
  it('会話から開いたときだけ、選んだ表情を会話の今の表情にして閉じる', async () => {
    useChatStore.setState({ chats: { c1: chat([chatMessage('m1', 'assistant', ['A'])]) } });
    const onClose = vi.fn();
    render(<AvatarExpressionDialog avatarId="a1" chatId="c1" onClose={onClose} />);
    fireEvent.click(await screen.findByTitle('neutral'));
    fireEvent.click(screen.getByRole('button', { name: '表情を決定' }));
    expect(onClose).toHaveBeenCalled();
    expect(useChatStore.getState().chats.c1?.expression).toEqual({ label: 'neutral', after: 'm1' });
  });

  it('アバターの画像の管理から開いたときは決定を押せない', async () => {
    open();
    fireEvent.click(await screen.findByTitle('neutral'));
    expect(screen.getByRole('button', { name: '表情を決定' })).toHaveProperty('disabled', true);
  });
});

describe('既定と画像', () => {
  it('右上の星で既定を替え、名前の右のアイコンでそのカードの画像を替える', async () => {
    open();
    await screen.findByTitle('neutral');
    const input = document.querySelector<HTMLInputElement>('input[type="file"][multiple]');
    await act(async () => {
      const joy = new File([minimalPngBlob()], 'joy.png', { type: 'image/png' });
      if (input !== null) fireEvent.change(input, { target: { files: [joy] } });
      await Promise.resolve();
    });
    fireEvent.click(await screen.findByRole('button', { name: 'joy を既定にする' }));
    expect(screen.getByRole('button', { name: 'joy は既定の表情' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'neutral を既定にする' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'neutral の画像を替える' }));
    const replace = document.querySelector<HTMLInputElement>('input[type="file"]:not([multiple])');
    await act(async () => {
      const next = new File(['n2'], 'calm.png', { type: 'image/png' });
      if (replace !== null) fireEvent.change(replace, { target: { files: [next] } });
      await Promise.resolve();
    });
    await waitFor(async () => {
      const saved = useAvatarsStore.getState().avatars.a1;
      const read = saved === undefined ? null : await readExpressionSet(saved.image);
      expect(read?.kind === 'ok' && read.set.defaultLabel).toBe('joy');
    });
  });
});

describe('ラベルを変える', () => {
  it('名前の右端の鉛筆で直し、ほかと同じなら理由を帯に出して欄を開いたままにする', async () => {
    open();
    await screen.findByTitle('neutral');
    fireEvent.click(screen.getByRole('button', { name: 'neutral の名前を変える' }));
    const field = screen.getByRole('combobox', { name: 'neutral の名前を変える' });
    fireEvent.change(field, { target: { value: '  ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByText('ラベルを入れてください。')).toBeTruthy();
    fireEvent.change(field, { target: { value: 'calm' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await screen.findByTitle('calm')).toBeTruthy();
  });

  it('欄の一覧から既定の感情を選んで決め、一覧を閉じた Esc で欄だけをやめる', async () => {
    const onClose = open();
    await screen.findByTitle('neutral');
    fireEvent.click(screen.getByRole('button', { name: 'neutral の名前を変える' }));
    fireEvent.click(screen.getByRole('button', { name: 'neutral の名前を変えるの一覧を開く' }));
    const labels = screen.getAllByRole('option').map((option) => option.textContent);
    expect(labels).toContain('joy');
    expect(labels).toHaveLength(PRESET_EXPRESSION_LABELS.length);
    fireEvent.click(screen.getByRole('option', { name: 'joy' }));
    expect(await screen.findByTitle('joy')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'joy の名前を変える' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'joy の名前を変える' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ほかの表情が使っているラベルは一覧に出さない', async () => {
    open();
    await screen.findByTitle('neutral');
    const input = document.querySelector<HTMLInputElement>('input[type="file"][multiple]');
    await act(async () => {
      const joy = new File(['j'], 'joy.webp', { type: 'image/webp' });
      if (input !== null) fireEvent.change(input, { target: { files: [joy] } });
      await Promise.resolve();
    });
    fireEvent.click(await screen.findByRole('button', { name: 'neutral の名前を変える' }));
    fireEvent.click(screen.getByRole('button', { name: 'neutral の名前を変えるの一覧を開く' }));
    const labels = screen.getAllByRole('option').map((option) => option.textContent);
    expect(labels).toContain('neutral');
    expect(labels).not.toContain('joy');
  });
});

describe('閉じる', () => {
  it('直した後も確かめずに閉じる（ラベルはもう書いてある）', async () => {
    const onClose = open();
    await screen.findByTitle('neutral');
    fireEvent.click(screen.getByRole('button', { name: 'neutral の名前を変える' }));
    const field = screen.getByRole('combobox', { name: 'neutral の名前を変える' });
    fireEvent.change(field, { target: { value: 'calm' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(async () => {
      const saved = useAvatarsStore.getState().avatars.a1;
      const read = saved === undefined ? null : await readExpressionSet(saved.image);
      expect(read?.kind).toBe('ok');
    });
  });
});

describe('漏れ', () => {
  it('開け閉めを繰り返しても、閉じたダイアログを残さない', async () => {
    const leak = leakWatch();
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      const view = render(<AvatarExpressionDialog avatarId="a1" onClose={vi.fn()} />);
      leak.watch(await screen.findByRole('dialog'));
      await act(async () => {
        view.unmount();
        await Promise.resolve();
      });
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
