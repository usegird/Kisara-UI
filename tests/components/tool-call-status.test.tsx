// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ToolCallState } from '@/chat/types';
import {
  ToolCallGenerateRow,
  ToolCallStateText,
  type GenerateRow,
} from '@/components/llm/message/ToolCallStatus';
import { useExecutionStore } from '@/store/use-execution-store';

afterEach(cleanup);

beforeEach(() => {
  useExecutionStore.getState().reset();
});

const queued: ToolCallState = { kind: 'queued', promptId: 'p1' };

describe('状態の文', () => {
  it('受け取り中はプロンプト生成中、完了を待つ間は画像を生成中', () => {
    const { container, rerender } = render(
      <ToolCallStateText state={{ kind: 'receiving' }} name="make_image" />,
    );
    expect(container.textContent).toBe('プロンプト生成中 : Comfy Workflow - make_image');
    rerender(<ToolCallStateText state={queued} name="make_image" />);
    expect(container.textContent).toBe('画像を生成中 : Comfy Workflow - make_image');
  });

  it('ComfyUI が今その実行を進めていれば、ステップ数を足す（ほかの実行の進捗は足さない）', () => {
    useExecutionStore.setState({ status: 'running', promptId: 'p1', progress: { value: 3, max: 20 } });
    const { container, rerender } = render(<ToolCallStateText state={queued} name="x" />);
    expect(container.textContent).toBe('画像を生成中（3/20） : Comfy Workflow - x');
    rerender(<ToolCallStateText state={{ kind: 'queued', promptId: 'p2' }} name="x" />);
    expect(container.textContent).toBe('画像を生成中 : Comfy Workflow - x');
  });
});

describe('ワークフローを実行で作らせている行', () => {
  it('作らせている間は、受け取り中の呼び出しと同じ文と回る印を出し、開けない', () => {
    const { container } = render(
      <ToolCallGenerateRow chatId="c1" row={{ kind: 'generating', name: 'make_image' }} />,
    );
    const line = screen.getByRole('button', { name: /プロンプト生成中 : Comfy Workflow/ });
    expect(line).toHaveProperty('disabled', true);
    expect(container.querySelector('.motion-safe\\:animate-spin')).not.toBeNull();
  });

  it('作らせられなければ失敗の行にし、開くと理由・応答の情報・LLM が書いた本文を出す', () => {
    const row: GenerateRow = {
      kind: 'failed',
      name: 'make_image',
      failure: { kind: 'bad-response' },
      attempt: {
        id: 'attempt_1',
        generation: { reasoning: '', usage: { prompt: 80, completion: 5 } },
        text: 'I cannot call it.',
      },
    };
    render(<ToolCallGenerateRow chatId="c1" row={row} />);
    fireEvent.click(screen.getByRole('button', { name: /失敗 : Comfy Workflow - make_image/ }));
    expect(screen.getByText('サーバーの応答を会話の応答として読めませんでした。')).toBeTruthy();
    expect(screen.getByText('I cannot call it.')).toBeTruthy();
    expect(screen.getByText(/80/)).toBeTruthy();
  });
});
