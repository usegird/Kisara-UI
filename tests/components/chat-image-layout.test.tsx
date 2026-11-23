// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatImageLayout } from '@/components/llm/workspace/ChatImageLayout';
import { useAvatarsStore } from '@/store/use-avatars-store';
import { useChatStore } from '@/store/use-chat-store';
import { usePlaybookPanelStore } from '@/store/use-playbook-panel-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { chat } from '../helpers/llm';

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  useAvatarsStore.setState({
    avatars: {
      a1: {
        id: 'a1',
        name: 'A',
        image: new Blob(['a1'], { type: 'image/png' }),
        hash: 'a1',
        createdAt: 0,
      },
    },
    loaded: true,
  });
  useChatStore.setState({ chats: { c1: chat([], { imageId: 'a1' }) } });
  useSettingsStore.setState({
    chatShowAvatar: true,
    chatImagePlace: 'right',
    chatImageFocusX: 50,
    chatImageFocusY: 0,
  });
});

afterEach(() => {
  cleanup();
});

describe('左右のアバターとログ', () => {
  it('画像のある左右の置き場では、ログの内側に余白を取る（スクロールバーは外枠の端）', () => {
    const { container } = render(
      <ChatImageLayout chatId="c1" log={<div role="log" />} composer={<div />} />,
    );
    const outer = container.querySelector('[style*="--chat-side-w"]');
    expect(outer?.className).toContain('--chat-pad-r');
    expect(
      screen.getByRole('log').contains(screen.getByRole('group', { name: 'プリセットの画像' })),
    ).toBe(false);
  });

  it('画像が無くても、相談かプレイブックのカードがある間はカードの側に余白を取る', () => {
    const outerClass = (): string =>
      document.querySelector('[style*="--chat-side-w"]')?.className ?? '';
    useChatStore.setState({ chats: { c1: chat([]) } });
    useSettingsStore.setState({ chatImagePlace: 'left' });
    render(<ChatImageLayout chatId="c1" log={<div />} composer={<div />} />);
    expect(outerClass()).not.toContain('--chat-pad-l');
    act(() => usePlaybookPanelStore.getState().setOpen('c1', true));
    expect(outerClass()).toContain('--chat-pad-l');
    cleanup();

    useSettingsStore.setState({ chatShowAvatar: false });
    render(<ChatImageLayout chatId="c1" log={<div />} composer={<div />} />);
    expect(outerClass()).toContain('--chat-pad-r');
    act(() => usePlaybookPanelStore.getState().setOpen('c1', false));
  });

  it('上下・背景に置いてカードがあるときの余白は、アバターの縦横でなくカードの並びの幅', () => {
    act(() => usePlaybookPanelStore.getState().setOpen('c1', true));
    useSettingsStore.setState({ chatCardWidth: 288 });
    for (const place of ['top', 'aboveInput', 'background'] as const) {
      useSettingsStore.setState({
        chatImagePlace: place,
        chatImageWidth: 800,
        chatImageHeight: 480,
      });
      render(<ChatImageLayout chatId="c1" log={<div />} composer={<div />} />);
      const outer = document.querySelector<HTMLElement>('[style*="--chat-side-w"]');
      expect(outer?.style.getPropertyValue('--chat-side-w')).toBe('288px');
      cleanup();
    }
    useSettingsStore.setState({ chatImagePlace: 'right' });
    render(<ChatImageLayout chatId="c1" log={<div />} composer={<div />} />);
    const outer = document.querySelector<HTMLElement>('[style*="--chat-side-w"]');
    expect(outer?.style.getPropertyValue('--chat-side-w')).toContain('800px');
    act(() => usePlaybookPanelStore.getState().setOpen('c1', false));
  });

  it('上下の置き場は画像が無くても場所を取る（重ねない）', () => {
    useChatStore.setState({ chats: { c1: chat([]) } });
    for (const place of ['top', 'aboveInput'] as const) {
      useSettingsStore.setState({ chatImagePlace: place });
      render(<ChatImageLayout chatId="c1" log={<div />} composer={<div />} />);
      const frame = screen.getByRole('group', { name: 'プリセットの画像' });
      expect(frame.closest('.h-0')).toBeNull();
      expect(frame.closest('.absolute')).toBeNull();
      expect(frame.parentElement?.className).toContain('--chat-pad-r');
      expect(frame.parentElement?.className).toContain('--chat-pad-l');
      cleanup();
    }
  });

  it('画像の上で回したホイールはログを送る', () => {
    render(<ChatImageLayout chatId="c1" log={<div role="log" />} composer={<div />} />);
    const log = screen.getByRole('log');
    const scrollBy = vi.fn();
    log.scrollBy = scrollBy;
    fireEvent.wheel(screen.getByRole('group', { name: 'プリセットの画像' }), { deltaY: 120 });
    expect(scrollBy).toHaveBeenCalledWith({ top: 120, left: 0 });
  });
});

describe('落とし先の枠', () => {
  it('左右の枠は両脇の余白、ほかは会話の欄に置き、幅を要素に直接持つ（クラスが効かなくても固まらない）', () => {
    render(<ChatImageLayout chatId="c1" log={<div />} composer={<div />} />);
    const boxes = [...document.querySelectorAll('.border-dashed.rounded-lg')].map(
      (zone) => zone.parentElement,
    );
    const [left, center, right] = [...new Set(boxes)];
    expect(left?.style.flex).toContain('var(--chat-pad-l, 0px)');
    expect(right?.style.flex).toContain('var(--chat-pad-r, 0px)');
    expect(center?.style.flex).toContain('46rem');
    expect(center?.children).toHaveLength(3);
    expect((left?.firstElementChild as HTMLElement | null)?.style.top).toBe('20%');
    expect((right?.firstElementChild as HTMLElement | null)?.style.top).toBe('20%');
  });
});

describe('アバターの中央点', () => {
  it('画像に焦点を当てて矢印キーで 5% ずつ動かし、端で止める。名前に今の中央点を含める', () => {
    render(<ChatImageLayout chatId="c1" log={<div />} composer={<div />} />);
    const image = screen.getByRole('img', { name: /中央点（横 50%・縦 0%/ });
    expect(image.tabIndex).toBe(0);

    fireEvent.keyDown(image, { key: 'ArrowRight' });
    fireEvent.keyDown(image, { key: 'ArrowUp' });
    expect(useSettingsStore.getState()).toMatchObject({ chatImageFocusX: 55, chatImageFocusY: 0 });
    expect(screen.getByRole('img', { name: /中央点（横 55%・縦 0%/ })).toBeTruthy();
  });
});
