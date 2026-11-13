// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ViewerHost } from '@/components/comfy/queue/ViewerHost';
import { EmbedAnchorsContext } from '@/components/ui/embed-anchors';
import { useAnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { useViewerStore } from '@/store/use-viewer-store';

import { stubMissingDom } from '../helpers/dom';

// ─────────────────────────────
// 会話のタブの画像ビューワーの置き場。重ねる範囲を測る見張りは、
// 開いている間だけ付け、閉じたら外す。
// ─────────────────────────────

beforeAll(stubMissingDom);

afterEach(() => {
  cleanup();
  useViewerStore.getState().close();
  vi.restoreAllMocks();
});

function Shell(): React.ReactElement {
  const anchors = useAnchorRegistry();
  return (
    <EmbedAnchorsContext value={anchors}>
      <div ref={anchors.register('chat')} />
      <ViewerHost />
    </EmbedAnchorsContext>
  );
}

const resizeListeners = (spy: { mock: { calls: readonly (readonly unknown[])[] } }): number =>
  spy.mock.calls.filter(([type]) => type === 'resize').length;

describe('測る見張り', () => {
  it('閉じている間は付けず、開くと付け、閉じると外す（開け閉めを繰り返しても残らない）', () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    render(<Shell />);
    expect(resizeListeners(added)).toBe(0);

    for (let round = 0; round < 3; round += 1) {
      act(() => useViewerStore.getState().openOverlay(null, [], 'k1'));
      act(() => useViewerStore.getState().close());
    }
    expect(resizeListeners(added)).toBe(3);
    expect(resizeListeners(removed)).toBe(3);
  });
});
