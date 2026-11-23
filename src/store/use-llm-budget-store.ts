import { create } from 'zustand';

export interface BudgetUsage {
  readonly input: number;
  readonly output: number;
}

interface BudgetState {
  readonly paused: BudgetUsage | null;
  readonly close: () => void;
  readonly asking: boolean;
}

export const useLlmBudgetStore = create<BudgetState>()((set) => ({
  paused: null,
  asking: false,
  close: () => set({ asking: false }),
}));
