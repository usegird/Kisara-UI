import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { finiteNumber, isRecord } from '@/lib/guards';
import { safeStorage } from '@/lib/safe-storage';

// ─────────────────────────────
// 利用規約・補足情報（外部クラウド・外部の ComfyUI・実行前の確認を行わない注意）への合意。
// 設定とは別の 1 項目として端末に残し、同意の関門が読む。
// ─────────────────────────────

/**
 * 同意を取り直す版。**利用者に不利で大きな改定のときだけ上げる**（字句の修正などでは上げない）。
 * 上げたら、それより古い版に同意した人にもう一度規約を出す
 */
export const TERMS_REVISION = 1;

/** 今の規約の効力が生じる日（規約の末尾に出す） */
export const TERMS_EFFECTIVE_DATE = '2026-10-24';

/**
 * 今のプライバシーポリシーの効力が生じる日（ポリシーの末尾に出す）。同意は利用規約とまとめて取るので、
 * 不利で重要な改定のときは TERMS_REVISION を上げて取り直す
 */
export const PRIVACY_EFFECTIVE_DATE = '2026-10-24';

/**
 * 利用上の注意事項の版。注意事項の中身を変えたら上げる。上げたら、はじめの画面で
 * 確認を取り直す（同意の取り直しとは別）
 */
export const NOTICE_REVISION = 1;

/** 利用規約への同意（版と時刻） */
interface TermsAcceptance {
  /** 同意した「取り直す版」 */
  readonly revision: number;
  /** 同意した時刻（ISO 8601） */
  readonly acceptedAt: string;
}

/** 残した値を読む。形が合わなければ null（同意していないとみなす。安全側に倒す） */
export function parseAcceptance(raw: unknown): TermsAcceptance | null {
  if (!isRecord(raw)) return null;
  const revision = finiteNumber(raw.revision);
  if (revision === null || typeof raw.acceptedAt !== 'string') return null;
  return { revision, acceptedAt: raw.acceptedAt };
}

/** 今の取り直す版に同意しているか。残した版が古ければ同意していないとみなす */
export function isAccepted(
  saved: TermsAcceptance | null,
  current: number = TERMS_REVISION,
): boolean {
  return saved !== null && saved.revision >= current;
}

/**
 * 時刻だけの合意（合意した時刻。ISO 8601）。外部クラウド接続の注意と、Workflow の実行前の確認を
 * 行わない注意
 */
interface CloudAgreement {
  readonly acceptedAt: string;
}

/** 残した値を読む。形が合わなければ null（合意していないとみなす） */
export function parseCloudAgreement(raw: unknown): CloudAgreement | null {
  return isRecord(raw) && typeof raw.acceptedAt === 'string'
    ? { acceptedAt: raw.acceptedAt }
    : null;
}

interface TermsState {
  readonly accepted: TermsAcceptance | null;
  /**
   * 利用上の注意事項を開いて「確認した」を押した版と時刻（合意ではなく確認の記録）
   */
  readonly notice: TermsAcceptance | null;
  readonly cloud: CloudAgreement | null;
  /** 外部の ComfyUI（私的なアドレスの外）に接続する注意への合意 */
  readonly comfyRemote: CloudAgreement | null;
  /** Workflow の実行前の確認を行わない注意への合意（最後に合意した時刻） */
  readonly bypass: CloudAgreement | null;
  readonly accept: () => void;
  readonly acknowledgeNotice: () => void;
  readonly acceptCloud: () => void;
  readonly acceptComfyRemote: () => void;
  readonly acceptBypass: () => void;
}

/** 合意の置き場（小さい保存領域。設定とは別の 1 項目） */
export const TERMS_KEY = 'kisaraui.terms';

export const useTermsStore = create<TermsState>()(
  persist(
    (set) => ({
      accepted: null,
      notice: null,
      cloud: null,
      comfyRemote: null,
      bypass: null,
      accept: () =>
        set({ accepted: { revision: TERMS_REVISION, acceptedAt: new Date().toISOString() } }),
      acknowledgeNotice: () =>
        set({ notice: { revision: NOTICE_REVISION, acceptedAt: new Date().toISOString() } }),
      acceptCloud: () => set({ cloud: { acceptedAt: new Date().toISOString() } }),
      acceptComfyRemote: () => set({ comfyRemote: { acceptedAt: new Date().toISOString() } }),
      acceptBypass: () => set({ bypass: { acceptedAt: new Date().toISOString() } }),
    }),
    {
      name: TERMS_KEY,
      storage: createJSONStorage(safeStorage),
      partialize: (state) => ({
        accepted: state.accepted,
        notice: state.notice,
        cloud: state.cloud,
        comfyRemote: state.comfyRemote,
        bypass: state.bypass,
      }),
      merge: (persisted, current) => ({
        ...current,
        accepted: parseAcceptance(isRecord(persisted) ? persisted.accepted : null),
        notice: parseAcceptance(isRecord(persisted) ? persisted.notice : null),
        cloud: parseCloudAgreement(isRecord(persisted) ? persisted.cloud : null),
        comfyRemote: parseCloudAgreement(isRecord(persisted) ? persisted.comfyRemote : null),
        bypass: parseCloudAgreement(isRecord(persisted) ? persisted.bypass : null),
      }),
    },
  ),
);

/** 今の取り直す版に同意しているか（購読せずに読む） */
export function termsAccepted(): boolean {
  return isAccepted(useTermsStore.getState().accepted);
}

/** 外部クラウド接続の注意に合意しているか（購読せずに読む） */
export function cloudAgreed(): boolean {
  return useTermsStore.getState().cloud !== null;
}

/** 外部の ComfyUI に接続する注意に合意しているか（購読せずに読む） */
export function comfyRemoteAgreed(): boolean {
  return useTermsStore.getState().comfyRemote !== null;
}
