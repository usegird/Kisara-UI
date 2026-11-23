// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyText } from '@/lib/clipboard';

function setClipboard(value: unknown): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', { value, configurable: true });
}

afterEach(() => {
  setClipboard(undefined);
});

describe('文字列を写す', () => {
  it('写せたら true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(copyText('a, b')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('a, b');
  });

  it('断られたら false（写したと見せない）', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });

    await expect(copyText('a')).resolves.toBe(false);
  });

  it('写し取りを持たない環境では false', async () => {
    await expect(copyText('a')).resolves.toBe(false);
  });
});
