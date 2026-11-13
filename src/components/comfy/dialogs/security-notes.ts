import { t } from '@/i18n';

// ─────────────────────────────
// ComfyUI のセキュリティの注意（起動オプションのリスクの解説）。接続のポップアップと種別の札
// （`landing.ts`）の両方から読む。
// ─────────────────────────────

const SECURITY_ITEMS = [
  'comfy.connect.securityCors',
  'comfy.connect.securityListen',
  'comfy.connect.securityDirect',
  'comfy.connect.securityTamper',
  'comfy.connect.securityScope',
  'comfy.connect.securityInspect',
] as const;

/** セキュリティの注意の文を、出す順に今の言語で返す */
export function comfySecurityNotes(): string[] {
  return SECURITY_ITEMS.map((key) => t(key));
}
