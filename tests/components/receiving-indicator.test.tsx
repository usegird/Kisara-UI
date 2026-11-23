// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ReceivingIndicator } from '@/components/llm/message/ReceivingIndicator';

afterEach(cleanup);

describe('受け取り中の印', () => {
  it('ツールを動かしている間は「ツールを実行中」、出典が届いたら「検索結果 N 件」を添える', () => {
    render(<ReceivingIndicator since={performance.now()} tooling results={5} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('ツールを実行中');
    expect(status.textContent).toContain('検索結果 5 件');
  });

  it('どちらも無ければ経過時間だけ', () => {
    render(<ReceivingIndicator since={performance.now()} />);
    const status = screen.getByRole('status');
    expect(status.textContent).not.toContain('ツールを実行中');
    expect(status.textContent).not.toContain('検索結果');
  });
});
