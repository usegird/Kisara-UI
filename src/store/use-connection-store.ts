import { create } from 'zustand';

import type { ConnectionDiagnosis, SocketGiveUp, SocketStatus } from '@/port/connection';
import type { ConnectionStatus } from '@/queue/connection-status';
import { comfyPort } from '@/store/ports/comfy-port';
import { useSettingsStore } from '@/store/use-settings-store';

interface ConnectionState {
  readonly status: ConnectionStatus;
  readonly socketStatus: SocketStatus;
  readonly socketRetry: number;
  readonly socketTimeout: SocketGiveUp | null;
  readonly socketSuspicion: number;
  readonly diagnosis: ConnectionDiagnosis | null;
  readonly pausing: boolean;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly probe: (baseUrl: string) => Promise<boolean>;
  readonly beginConnect: () => void;
  readonly succeed: () => void;
  readonly fail: (diagnosis: ConnectionDiagnosis) => void;
  readonly setSocketStatus: (status: SocketStatus) => void;
  readonly setSocketRetry: (attempt: number) => void;
  readonly timeOutSocket: (reason: SocketGiveUp) => void;
  readonly suspectSocket: () => void;
  readonly reset: () => void;
}

const INITIAL = {
  status: 'disconnected' as ConnectionStatus,
  socketStatus: 'closed' as SocketStatus,
  socketRetry: 0,
  socketTimeout: null,
  socketSuspicion: 0,
  diagnosis: null,
  pausing: false,
};

export const useConnectionStore = create<ConnectionState>()((set) => ({
  ...INITIAL,

  probe: async (baseUrl) => {
    set({ status: 'connecting', diagnosis: null });
    try {
      await comfyPort().connection.check(baseUrl);
      set({ status: 'connected', diagnosis: null });
      return true;
    } catch (error) {
      const diagnosis = await comfyPort().connection.diagnose(error, baseUrl);
      set({ status: 'failed', diagnosis });
      return false;
    }
  },
  beginConnect: () => set({ status: 'connecting', diagnosis: null }),
  pause: () => set({ status: 'disconnected', diagnosis: null, pausing: true }),
  resume: () => set({ pausing: false }),
  succeed: () => set({ status: 'connected', diagnosis: null }),
  fail: (diagnosis) => set({ status: 'failed', diagnosis }),
  setSocketStatus: (socketStatus) =>
    set(
      socketStatus === 'open'
        ? { socketStatus, socketRetry: 0, socketTimeout: null }
        : socketStatus === 'connecting'
          ? { socketStatus, socketRetry: 0 }
          : { socketStatus },
    ),
  setSocketRetry: (socketRetry) => set({ socketRetry }),
  timeOutSocket: (socketTimeout) => set({ socketTimeout }),
  suspectSocket: () => set((state) => ({ socketSuspicion: state.socketSuspicion + 1 })),
  reset: () => set(INITIAL),
}));

export function connectedComfyUrl(): string | null {
  if (useConnectionStore.getState().status !== 'connected') return null;
  const baseUrl = useSettingsStore.getState().baseUrl;
  return baseUrl.trim().length === 0 ? null : baseUrl;
}
