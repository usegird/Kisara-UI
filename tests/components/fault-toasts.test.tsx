// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FaultToasts } from '@/components/app/FaultToasts';
import { Toaster } from '@/components/ui/toast';
import { useFaultStore } from '@/store/use-fault-store';

// ─────────────────────────────
// 想定外の失敗は帯に積まず、画面上部の知らせ（トースト）に出す
// ─────────────────────────────

afterEach(() => {
  cleanup();
  useFaultStore.getState().clear();
});

describe('想定外の失敗の知らせ', () => {
  it('届いた失敗を、どこで起きたかと理由で知らせる', async () => {
    const { container } = render(
      <>
        <Toaster />
        <FaultToasts />
      </>,
    );
    act(() => useFaultStore.getState().report('保存', 'boom'));

    expect(await screen.findByText('保存で想定外の失敗が起きました')).toBeDefined();
    expect(container.textContent).toBe('');
  });
});
