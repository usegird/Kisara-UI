// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkflowFileInput } from '@/components/comfy/WorkflowFileInput';

// ─────────────────────────────
// 画面へ落としたファイルで開く。ファイルを運ぶドラッグだけを受ける。
// ─────────────────────────────

afterEach(cleanup);

function setup(): ReturnType<typeof vi.fn> {
  const openFile = vi.fn(() => Promise.resolve());
  render(<WorkflowFileInput openFile={openFile} fileInput={{ current: null }} />);
  return openFile;
}

function drop(types: string[], files: File[]): Event {
  const event = createEvent.drop(document.body, { dataTransfer: { types, files } });
  fireEvent(document.body, event);
  return event;
}

function dragOver(types: string[]): void {
  fireEvent(document.body, createEvent.dragOver(document.body, { dataTransfer: { types } }));
}

describe('画面へ落としたファイル', () => {
  it('どこに落としても開き、ブラウザには開かせない', () => {
    const openFile = setup();
    const file = new File(['{}'], 'flow.json', { type: 'application/json' });

    const event = drop(['Files'], [file]);
    expect(openFile).toHaveBeenCalledWith(file);
    expect(event.defaultPrevented).toBe(true);
  });

  it('文字のドラッグは受けない', () => {
    const openFile = setup();
    const event = drop(['text/plain'], []);
    expect(openFile).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('ファイルを運んでいる間だけ、落とせば開くと分かる案内を重ねる', () => {
    vi.useFakeTimers();
    try {
      setup();
      dragOver(['text/plain']);
      expect(screen.queryByRole('status')).toBeNull();

      dragOver(['Files']);
      expect(screen.getByRole('status').textContent).toBe('ファイルを開く');
      // 運ぶのが途切れたら（画面の外へ出たら）消す
      act(() => void vi.advanceTimersByTime(200));
      expect(screen.queryByRole('status')).toBeNull();

      // 落としたら消す
      dragOver(['Files']);
      act(() => void drop(['Files'], [new File(['{}'], 'flow.json')]));
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
