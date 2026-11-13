// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OutputImage } from '@/components/comfy/queue/OutputImage';
import { useConnectionStore } from '@/store/use-connection-store';
import { useOutputImagesStore } from '@/store/use-output-images-store';

// ─────────────────────────────
// 結果画像は画面に近づいてから取りに行く。見張りは近づくまでだけ付け、
// 近づいたら・部品を外したら外す。
// ─────────────────────────────

const fetchOutputImage = vi.hoisted(() =>
  vi.fn<() => Promise<{ blob: Blob; modifiedAt: number | null }>>(),
);
vi.mock('@/comfy/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/queue')>()),
  fetchOutputImage,
}));

type Notify = (entries: { isIntersecting: boolean }[]) => void;
let observers: { notify: Notify; disconnected: boolean }[] = [];

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      readonly #entry: { notify: Notify; disconnected: boolean };
      constructor(notify: Notify) {
        this.#entry = { notify, disconnected: false };
        observers.push(this.#entry);
      }
      observe(): void {}
      disconnect(): void {
        this.#entry.disconnected = true;
      }
    },
  );
  URL.createObjectURL = vi.fn(() => 'blob:1');
  useConnectionStore.setState({ status: 'connected' });
  useOutputImagesStore.setState({ images: new Map() });
  fetchOutputImage.mockReset();
  fetchOutputImage.mockResolvedValue({ blob: new Blob(['x']), modifiedAt: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useConnectionStore.setState({ status: 'disconnected' });
});

const file = { filename: 'a.png', subfolder: '', type: 'output' as const };

describe('画面に近づいてから取る', () => {
  it('近づくまでは取りに行かず、近づいたら取り、見張りを外す', async () => {
    render(<OutputImage file={file} baseUrl="http://comfy" />);
    await waitFor(() => expect(observers).toHaveLength(1));
    expect(fetchOutputImage).not.toHaveBeenCalled();

    act(() => observers[0]?.notify([{ isIntersecting: true }]));
    await waitFor(() => expect(fetchOutputImage).toHaveBeenCalledTimes(1));
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
  });

  it('近づく前に外しても見張りを残さない（付けては外すのを繰り返しても）', () => {
    for (let round = 0; round < 3; round += 1) {
      render(<OutputImage file={file} baseUrl="http://comfy" />);
      cleanup();
    }
    expect(observers).toHaveLength(3);
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
    expect(fetchOutputImage).not.toHaveBeenCalled();
  });
});
