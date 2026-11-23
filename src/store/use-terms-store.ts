import { create } from 'zustand';

import {
  createAcceptance,
  isAccepted,
  isAgreementKey,
  loadAgreement,
  NOTICE_REVISION,
  parseAcceptance,
  parseCloudAgreement,
  saveAgreement,
  TERMS_REVISION,
  type CloudAgreement,
  type TermsAcceptance,
} from '@/store/persist/agreements';

export {
  isAccepted,
  NOTICE_REVISION,
  parseAcceptance,
  parseCloudAgreement,
  PRIVACY_EFFECTIVE_DATE,
  TERMS_EFFECTIVE_DATE,
  TERMS_REVISION,
} from '@/store/persist/agreements';

interface TermsRecords {
  readonly accepted: TermsAcceptance | null;
  readonly notice: TermsAcceptance | null;
  readonly cloud: CloudAgreement | null;
  readonly comfyRemote: CloudAgreement | null;
  readonly bypass: CloudAgreement | null;
}

interface TermsState extends TermsRecords {
  readonly accept: () => void;
  readonly acknowledgeNotice: () => void;
  readonly acceptCloud: () => void;
  readonly acceptComfyRemote: () => void;
  readonly acceptBypass: () => void;
}

export const useTermsStore = create<TermsState>()((set) => ({
  ...loadRecords(),
  accept: () => {
    const accepted = createAcceptance(TERMS_REVISION);
    saveAgreement('terms', accepted);
    set({ accepted });
  },
  acknowledgeNotice: () => {
    const notice = createAcceptance(NOTICE_REVISION);
    saveAgreement('notice', notice);
    set({ notice });
  },
  acceptCloud: () => set({ cloud: saveTimeOnly('cloud') }),
  acceptComfyRemote: () => set({ comfyRemote: saveTimeOnly('comfy-remote') }),
  acceptBypass: () => set({ bypass: saveTimeOnly('bypass') }),
}));

globalThis.addEventListener?.('storage', (event: StorageEvent) => {
  if (event.key !== null && !isAgreementKey(event.key)) return;
  useTermsStore.setState(loadRecords());
});

export function termsAccepted(): boolean {
  return isAccepted(useTermsStore.getState().accepted);
}

export function cloudAgreed(): boolean {
  return useTermsStore.getState().cloud !== null;
}

export function comfyRemoteAgreed(): boolean {
  return useTermsStore.getState().comfyRemote !== null;
}

function loadRecords(): TermsRecords {
  return {
    accepted: parseAcceptance(loadAgreement('terms')),
    notice: parseAcceptance(loadAgreement('notice')),
    cloud: parseCloudAgreement(loadAgreement('cloud')),
    comfyRemote: parseCloudAgreement(loadAgreement('comfy-remote')),
    bypass: parseCloudAgreement(loadAgreement('bypass')),
  };
}

function saveTimeOnly(id: 'cloud' | 'comfy-remote' | 'bypass'): CloudAgreement {
  const agreement = { acceptedAt: new Date().toISOString() };
  saveAgreement(id, agreement);
  return agreement;
}
