// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePopupContainer } from '@/hooks/ui/use-popup-container';
import type { Popup } from '@/lib/popup';

// ─────────────────────────────
// 別ウィンドウの見張り。jsdom は窓を開けないので、窓の代役で確かめる。
// ─────────────────────────────

interface FakeView {
  closed: boolean;
  readonly close: ReturnType<typeof vi.fn>;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
}

function fakePopup(): { readonly popup: Popup; readonly view: FakeView } {
  const view: FakeView = {
    closed: false,
    close: vi.fn(() => {
      view.closed = true;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const popup = {
    window: view as unknown as Window,
    mount: document.createElement('div'),
  } satisfies Popup;
  return { popup, view };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('別ウィンドウの見張り', () => {
  // 受け口を依存に入れると、変わるたびに見張りを張り直し、その後始末で窓を閉じてしまう
  it('受け口が変わっても窓を閉じず張り直さず、閉じられたら最新の受け口を呼ぶ', () => {
    const { popup, view } = fakePopup();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ onClosed }: { onClosed: () => void }) => usePopupContainer(popup, onClosed),
      { initialProps: { onClosed: first } },
    );

    rerender({ onClosed: second });
    expect(view.close).not.toHaveBeenCalled();
    expect(view.addEventListener).toHaveBeenCalledTimes(1);

    view.closed = true;
    vi.advanceTimersByTime(600);
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    unmount();
  });

  // 別窓の出し先は窓を預かった時点で現れるので、開発時の StrictMode は置いた直後に後始末を一度走らせる
  it('置いた直後に後始末と張り直しが続いても、窓を閉じない', () => {
    const { popup, view } = fakePopup();
    const { unmount } = renderHook(() => usePopupContainer(popup, vi.fn()), {
      reactStrictMode: true,
    });

    vi.advanceTimersByTime(600);
    expect(view.close).not.toHaveBeenCalled();
    unmount();
    vi.advanceTimersByTime(0);
    expect(view.close).toHaveBeenCalledTimes(1);
  });

  it('外れるときは窓を閉じ、見張りも外す', () => {
    const { popup, view } = fakePopup();
    const onClosed = vi.fn();
    const { unmount } = renderHook(() => usePopupContainer(popup, onClosed));

    unmount();
    vi.advanceTimersByTime(0);
    expect(view.close).toHaveBeenCalledTimes(1);
    expect(view.removeEventListener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600);
    expect(onClosed).not.toHaveBeenCalled();
  });
});
