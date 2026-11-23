import { create } from 'zustand';

import { createConnectDialogFlags, type ConnectDialogFlags } from '@/store/kit/connect-dialog';

interface ComfyConnectDialogState extends ConnectDialogFlags {
  readonly autoTried: boolean;
  readonly remotePending: string | null;
  readonly connected: () => void;
  readonly markAutoTried: () => void;
  readonly askRemote: (url: string) => void;
  readonly clearRemote: () => void;
}

export const useComfyConnectDialogStore = create<ComfyConnectDialogState>()((set) => ({
  ...createConnectDialogFlags(set),
  autoTried: false,
  remotePending: null,
  connected: () => set({ requested: false }),
  markAutoTried: () => set({ autoTried: true }),
  askRemote: (url) => set({ requested: true, remotePending: url }),
  clearRemote: () => set({ remotePending: null }),
}));
