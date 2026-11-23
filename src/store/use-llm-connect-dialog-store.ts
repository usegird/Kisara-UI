import { create } from 'zustand';

import { createConnectDialogFlags, type ConnectDialogFlags } from '@/store/kit/connect-dialog';

export const useLlmConnectDialogStore = create<ConnectDialogFlags>()((set) =>
  createConnectDialogFlags(set),
);
