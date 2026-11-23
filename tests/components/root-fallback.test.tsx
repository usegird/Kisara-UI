// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RootFallback } from '@/components/app/RootFallback';
import { downloadText } from '@/lib/download';

vi.mock('@/lib/download', () => ({ downloadText: vi.fn() }));

afterEach(cleanup);

describe('診断ファイルの書き出し', () => {
  it('押すと全文を出し、保存するを押したときだけ書き出す', async () => {
    render(<RootFallback error={new Error('boom')} onRetry={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'ログをエクスポート' }));

    const preview = await screen.findByRole<HTMLTextAreaElement>('textbox', {
      name: '書き出す中身（全文）',
    });
    expect(preview.value).toContain('"faults"');
    expect(downloadText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(downloadText).toHaveBeenCalledWith(
      preview.value,
      expect.any(String),
      'application/json',
    );
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
