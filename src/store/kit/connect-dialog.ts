export interface ConnectDialogFlags {
  readonly requested: boolean;
  readonly dismissed: boolean;
  readonly open: () => void;
  readonly close: () => void;
}

export function createConnectDialogFlags(
  set: (patch: Partial<Pick<ConnectDialogFlags, 'requested' | 'dismissed'>>) => void,
): ConnectDialogFlags {
  return {
    requested: false,
    dismissed: false,
    open: () => set({ requested: true }),
    close: () => set({ requested: false, dismissed: true }),
  };
}
