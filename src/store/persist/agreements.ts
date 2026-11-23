import { finiteNumber, isRecord } from '@/lib/guards';
import { safeStorage } from '@/lib/safe-storage';

export const TERMS_REVISION = 1;

export const TERMS_EFFECTIVE_DATE = '2026-10-24';

export const PRIVACY_EFFECTIVE_DATE = '2026-10-24';

export const NOTICE_REVISION = 1;

const AGREEMENT_PREFIX = 'kisaraui.agreement.';

export type AgreementId = 'terms' | 'notice' | 'cloud' | 'comfy-remote' | 'bypass';

export interface TermsAcceptance {
  readonly revision: number;
  readonly acceptedAt: string;
}

export interface CloudAgreement {
  readonly acceptedAt: string;
}

export function agreementKeyOf(id: AgreementId): string {
  return AGREEMENT_PREFIX + id;
}

export function isAgreementKey(key: string): boolean {
  return key.startsWith(AGREEMENT_PREFIX);
}

export function loadAgreement(id: AgreementId): unknown {
  const raw = safeStorage().getItem(agreementKeyOf(id));
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function saveAgreement(id: AgreementId, value: TermsAcceptance | CloudAgreement): void {
  safeStorage().setItem(agreementKeyOf(id), JSON.stringify(value));
}

export function parseAcceptance(raw: unknown): TermsAcceptance | null {
  if (!isRecord(raw)) return null;
  const revision = finiteNumber(raw.revision);
  if (revision === null || typeof raw.acceptedAt !== 'string') return null;
  return { revision, acceptedAt: raw.acceptedAt };
}

export function parseCloudAgreement(raw: unknown): CloudAgreement | null {
  return isRecord(raw) && typeof raw.acceptedAt === 'string'
    ? { acceptedAt: raw.acceptedAt }
    : null;
}

export function isAccepted(
  saved: TermsAcceptance | null,
  current: number = TERMS_REVISION,
): boolean {
  return saved !== null && saved.revision >= current;
}

export function createAcceptance(revision: number): TermsAcceptance {
  return { revision, acceptedAt: new Date().toISOString() };
}
