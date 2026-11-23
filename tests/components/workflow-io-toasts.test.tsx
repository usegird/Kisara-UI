// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkflowIoToasts } from '@/components/comfy/WorkflowIoToasts';
import { Toaster } from '@/components/ui/toast';

afterEach(() => {
  cleanup();
});

function show(saveState: React.ComponentProps<typeof WorkflowIoToasts>['saveState']) {
  return render(
    <>
      <Toaster />
      <WorkflowIoToasts saveState={saveState} fileError={null} />
    </>,
  );
}

describe('保存の知らせ', () => {
  it('保存できたら保存先を知らせ、帯には出さない', async () => {
    const { container } = show({ kind: 'saved', path: 'a/b.json' });
    await act(async () => {});

    expect(await screen.findByText('ComfyUI に保存しました')).toBeDefined();
    expect(screen.getByText('workflows/a/b.json')).toBeDefined();
    expect(container.textContent).not.toContain('保存しました');
  });

  it('保存できなければ理由を知らせる', async () => {
    show({ kind: 'error', message: 'HTTP 500' });

    expect(await screen.findByText('ComfyUI に保存できません')).toBeDefined();
    expect(screen.getByText('HTTP 500')).toBeDefined();
  });
});

describe('読み込みの失敗の知らせ', () => {
  it('帯に出さず、同じ理由で続けて失敗したら回数を増やして知らせ直す', async () => {
    const { container, rerender } = render(
      <>
        <Toaster />
        <WorkflowIoToasts saveState={{ kind: 'idle' }} fileError={{ message: '読めない形' }} />
      </>,
    );
    expect(await screen.findByText('ワークフローを読み込めません')).toBeDefined();
    expect(container.textContent).not.toContain('読めない形');

    rerender(
      <>
        <Toaster />
        <WorkflowIoToasts saveState={{ kind: 'idle' }} fileError={{ message: '読めない形' }} />
      </>,
    );
    expect(await screen.findByText('×2')).toBeDefined();
    expect(screen.getAllByText('ワークフローを読み込めません')).toHaveLength(1);
  });
});
