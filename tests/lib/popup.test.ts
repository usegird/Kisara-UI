// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openPopup } from '@/lib/popup';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
});

describe('別ウィンドウの配色', () => {
  it('元のページの dark のクラスと color-scheme を写す（ダークで地が白くならない）', () => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
    const child = document.implementation.createHTMLDocument('');
    vi.stubGlobal(
      'open',
      vi.fn(() => ({ document: child, focus: vi.fn() })),
    );

    expect(openPopup('test', 'Test')).not.toBeNull();
    expect(child.documentElement.classList.contains('dark')).toBe(true);
    expect(child.documentElement.style.colorScheme).toBe('dark');
  });
});
