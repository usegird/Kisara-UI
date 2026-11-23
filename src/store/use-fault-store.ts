import { create } from 'zustand';

import { t } from '@/i18n';
import { traceFault } from '@/lib/trace';
import { formatFault } from '@/queue/comfy-failure-text';

const FAULT_LIMIT = 20;

interface Fault {
  readonly id: number;
  readonly where: string;
  readonly message: string;
  readonly at: number;
}

interface FaultState {
  readonly faults: readonly Fault[];
  readonly report: (where: string, message: string) => void;
  readonly clear: () => void;
}

let nextId = 1;

export const useFaultStore = create<FaultState>()((set) => ({
  faults: [],

  report: (where, message) =>
    set((state) => {
      const latest = state.faults[0];
      if (latest !== undefined && latest.where === where && latest.message === message) {
        return state;
      }
      return {
        faults: [{ id: nextId++, where, message, at: Date.now() }, ...state.faults].slice(
          0,
          FAULT_LIMIT,
        ),
      };
    }),

  clear: () => set({ faults: [] }),
}));

export function installFaultHandlers(target: Window = window): () => void {
  const later = (where: string, message: string): void =>
    queueMicrotask(() => useFaultStore.getState().report(where, message));
  const onError = (event: ErrorEvent): void => {
    const where = t('fault.where.processing');
    traceFault(where, event.error ?? event.message);
    later(where, formatFault(event.error ?? event.message));
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    const where = t('fault.where.operation');
    traceFault(where, event.reason);
    later(where, formatFault(event.reason));
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
