// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LlmBudgetDialog } from '@/components/llm/dialogs/LlmBudgetDialog';
import { resumeLlmBudget } from '@/store/ports/llm-budget';
import { useLlmBudgetStore } from '@/store/use-llm-budget-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

// ─────────────────────────────
// 要求の量が閾値を超えたときの確かめ
// ─────────────────────────────

afterEach(() => {
  cleanup();
  resumeLlmBudget();
});

function pause(): void {
  act(() => useLlmBudgetStore.setState({ paused: { input: 1200, output: 95000 }, asking: true }));
}

describe('続けるかの確かめ', () => {
  it('量を出し、続けると止めるのを外す。止めたままなら閉じるだけ', async () => {
    render(<LlmBudgetDialog />);
    pause();
    expect(await screen.findByText(/95,000/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '止めたままにする' }));
    expect(useLlmBudgetStore.getState()).toMatchObject({ asking: false });
    expect(useLlmBudgetStore.getState().paused).not.toBeNull();

    pause();
    fireEvent.click(await screen.findByRole('button', { name: '続ける' }));
    expect(useLlmBudgetStore.getState().paused).toBeNull();
  });

  it('開いて閉じるのを繰り返しても、閉じた画面を残さない', async () => {
    render(<LlmBudgetDialog />);
    const leak = leakWatch();
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      pause();
      leak.watch(await screen.findByRole('alertdialog'));
      act(() => resumeLlmBudget());
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
