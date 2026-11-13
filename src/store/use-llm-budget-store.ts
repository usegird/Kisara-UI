import { create } from 'zustand';

// ─────────────────────────────
// 要求の量の歯止めの状態。止めているか、確かめる画面を出しているか。端末に残さない。
// 数える・続けるのは llm-budget.ts
// ─────────────────────────────

/** 窓の間に数えた量 */
export interface BudgetUsage {
  readonly input: number;
  readonly output: number;
}

interface BudgetState {
  /** 閾値を超えて止めている。続けると外す（null は止めていない） */
  readonly paused: BudgetUsage | null;
  /** 止めたままにする（確かめる画面を閉じる。次の要求でまた確かめる） */
  readonly close: () => void;
  /** 確かめる画面を出しているか */
  readonly asking: boolean;
}

export const useLlmBudgetStore = create<BudgetState>()((set) => ({
  paused: null,
  asking: false,
  close: () => set({ asking: false }),
}));
