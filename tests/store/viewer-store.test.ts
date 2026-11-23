import { beforeEach, describe, expect, it } from 'vitest';

import type { Popup } from '@/lib/popup';
import { useViewerStore } from '@/store/use-viewer-store';

const popup = { window: {} as Window, mount: {} as HTMLElement } satisfies Popup;

beforeEach(() => {
  useViewerStore.getState().close();
});

describe('ビューワーの出し方', () => {
  it('はじめは閉じている', () => {
    expect(useViewerStore.getState().mode).toBe('closed');
  });

  it('重ねて開くと、見ている位置を覚える', () => {
    useViewerStore.getState().openOverlay('a:temp:/1.png');

    const state = useViewerStore.getState();
    expect(state.mode).toBe('overlay');
    expect(state.current).toBe('a:temp:/1.png');
  });

  it('別窓へ移しても位置は引き継ぐ', () => {
    useViewerStore.getState().openOverlay('a:temp:/1.png');
    useViewerStore.getState().openWindow(popup);

    const state = useViewerStore.getState();
    expect(state.mode).toBe('window');
    expect(state.popup).toBe(popup);
    expect(state.current).toBe('a:temp:/1.png');
  });

  it('窓を塞がれたら、そのことだけ残す', () => {
    useViewerStore.getState().openWindow(null);

    const state = useViewerStore.getState();
    expect(state.blocked).toBe(true);
    expect(state.mode).toBe('closed');
  });

  it('閉じると窓の参照も捨てる', () => {
    useViewerStore.getState().openWindow(popup, 'a:temp:/1.png');
    useViewerStore.getState().close();

    const state = useViewerStore.getState();
    expect(state.mode).toBe('closed');
    expect(state.popup).toBeNull();
    expect(state.current).toBeNull();
  });
});
