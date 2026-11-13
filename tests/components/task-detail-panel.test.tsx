// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskDetailPanel } from '@/components/comfy/queue/TaskDetailPanel';
import { DEFAULT_SPLIT_RATIO } from '@/store/settings-fields/split-ratio';
import { useSettingsStore } from '@/store/use-settings-store';

import { outputFile, queueTask } from '../helpers/queue';

// 履歴も画像も取りに行かない（テストから ComfyUI に触れない）
vi.mock('@/comfy/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/queue')>()),
  fetchHistoryItem: () => Promise.reject(new Error('テストでは取らない')),
  fetchOutputImage: () => Promise.reject(new Error('テストでは取らない')),
  fetchPromptFromImage: () => Promise.reject(new Error('テストでは取らない')),
}));

// ─────────────────────────────
// キューの詳細。ノードと変数の列に重ねる。画像は右上のアイコンでビューワーに切り替える
// ─────────────────────────────

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ taskDetailImageRatio: DEFAULT_SPLIT_RATIO });
});

function show(props: Partial<React.ComponentProps<typeof TaskDetailPanel>> = {}) {
  const onOpenViewer = vi.fn();
  render(
    <TaskDetailPanel
      task={queueTask('p1', [outputFile('a.png', 'output')])}
      onMove={vi.fn()}
      hasNewer={false}
      hasOlder={false}
      cached={null}
      onDetail={vi.fn()}
      baseUrl="http://127.0.0.1:8188"
      definitions={new Map()}
      timings={[]}
      workflowName={null}
      onOpenViewer={onOpenViewer}
      follow
      onFollowChange={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
  return onOpenViewer;
}

describe('詳細の画像', () => {
  it('右上のアイコンで、そのタスクの画像からビューワーに切り替える', () => {
    const onOpenViewer = show();
    fireEvent.click(screen.getByLabelText('ビューワーで開く'));

    expect(onOpenViewer).toHaveBeenCalledWith('p1');
  });

  it('画像との境目はキーボードでも動かせ、隣のタスクへの送りには流さない', () => {
    const onMove = vi.fn();
    show({ onMove });
    const divider = screen.getByRole('separator', { name: '画像の幅' });
    const before = Number(divider.getAttribute('aria-valuenow'));

    fireEvent.keyDown(divider, { key: 'ArrowLeft' });

    expect(Number(divider.getAttribute('aria-valuenow'))).toBe(before + 5);
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe('重ねた詳細の操作', () => {
  it('追従のアイコンを切り替えられ、Esc で閉じる', () => {
    const onFollowChange = vi.fn();
    const onClose = vi.fn();
    show({ onFollowChange, onClose });

    // 入っている間は押された見た目（ビューワーと同じアイコン）
    const follow = screen.getByRole('button', { name: '新しいタスクに追従する' });
    expect(follow.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(follow);
    expect(onFollowChange).toHaveBeenCalledWith(false);

    fireEvent.keyDown(screen.getByRole('region', { name: 'タスクの詳細' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
