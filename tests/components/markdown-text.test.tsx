// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MarkdownText } from '@/components/llm/message/MarkdownText';

afterEach(cleanup);

function draw(text: string): HTMLElement {
  return render(<MarkdownText text={text} />).container;
}

describe('描かない・読み込まないもの', () => {
  it('生の HTML は要素にせず文字のまま出す', () => {
    const container = draw('<script>alert(1)</script><b>x</b>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>x</b>');
  });

  it('画像は読み込まず、代わりの文をリンクにする', () => {
    const container = draw('![secret](https://evil.example/x.png?q=1)');
    expect(container.querySelector('img')).toBeNull();
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://evil.example/x.png?q=1');
    expect(link?.textContent).toBe('secret');
  });

  it('http と https だけを押せるリンクにし、新しいタブで開く', () => {
    const container = draw(
      '[ok](https://example.com) [bad](javascript:alert(1)) [mail](mailto:a@b)',
    );
    const links = [...container.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://example.com']);
    expect(links[0]?.getAttribute('target')).toBe('_blank');
    expect(links[0]?.getAttribute('rel')).toContain('noopener');
    expect(container.textContent).toContain('bad');
  });
});

describe('描くもの', () => {
  it('強調・表・コードブロック・単独の改行を描く', () => {
    const container = draw('*act*\nline2\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```\ncode\n```');
    expect(container.querySelector('em')?.textContent).toBe('act');
    expect(container.querySelector('br')).not.toBeNull();
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('pre')?.textContent).toContain('code');
    expect(container.querySelector('button[aria-label]')).not.toBeNull();
  });
});
