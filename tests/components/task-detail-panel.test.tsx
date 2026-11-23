// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskDetailPanel } from '@/components/comfy/queue/TaskDetailPanel';
import { DEFAULT_SPLIT_RATIO } from '@/store/settings-fields/split-ratio';
import { useSettingsStore } from '@/store/use-settings-store';

import { outputFile, queueTask } from '../helpers/queue';

vi.mock('@/comfy/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/queue')>()),
  fetchHistoryItem: () => Promise.reject(new Error('テストでは取らない')),
  fetchOutputImage: () => Promise.reject(new Error('テストでは取らない')),
  fetchPromptFromImage: () => Promise.reject(new Error('テストでは取らない')),
}));

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

    const follow = screen.getByRole('button', { name: '新しいタスクに追従する' });
    expect(follow.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(follow);
    expect(onFollowChange).toHaveBeenCalledWith(false);

    fireEvent.keyDown(screen.getByRole('region', { name: 'タスクの詳細' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('出力の文字', () => {
  function entryWith(outputs: Record<string, unknown>): unknown {
    const nodes = { '5': { class_type: 'PreviewAny', inputs: {} } };
    return { prompt: [0, 'p1', nodes, {}, []], outputs };
  }

  it('出力ノードが返した文字を、ノードの表記と写し取りを添えて改行のまま出す', async () => {
    show({
      cached: entryWith({
        '5': { text: ['a cat,\nsmile'] },
        '9': { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] },
      }),
    });

    const heading = await screen.findByText('出力の文字');
    const section = heading.closest('section') ?? heading.parentElement;
    expect(section?.textContent).toContain('#5 PreviewAny');
    expect(screen.getByText(/a cat,/u).textContent).toBe('a cat,\nsmile');
    expect(screen.getByRole('button', { name: '出力の文字を写す' })).toBeTruthy();
  });

  it('文字を返したノードが無ければ段を出さない', async () => {
    show({ cached: entryWith({ '9': { images: [] } }) });

    expect(await screen.findByText('プロンプト')).toBeTruthy();
    expect(screen.queryByText('出力の文字')).toBeNull();
  });
});
