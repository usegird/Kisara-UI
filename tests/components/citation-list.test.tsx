// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CitationList } from '@/components/llm/message/CitationList';

// ─────────────────────────────
// 出典の一覧。番号・タイトル・ドメイン。タイトルが無ければ URL。別のタブで開く
// ─────────────────────────────

afterEach(cleanup);

describe('出典の一覧', () => {
  it('番号つきでタイトルとドメインを出し、タイトルが無ければ URL を出す', () => {
    render(
      <CitationList
        citations={[
          { url: 'https://vite.dev/blog/x', title: 'Vite 5' },
          { url: 'https://b.example/page', title: '' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual(['[1]Vite 5vite.dev', '[2]https://b.example/page']);
    const link = screen.getByRole('link', { name: 'Vite 5' });
    expect(link.getAttribute('href')).toBe('https://vite.dev/blog/x');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('http・https でない URL はリンクにせず文字のまま出す（前に残った出典にも効く）', () => {
    render(
      <CitationList
        citations={[
          { url: 'javascript:alert(1)', title: 'bad' },
          { url: 'data:text/html,x', title: '' },
        ]}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('bad')).toBeTruthy();
  });
});
