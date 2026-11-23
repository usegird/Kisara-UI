import { t } from '@/i18n';

const SECURITY_ITEMS = [
  'comfy.connect.securityCors',
  'comfy.connect.securityListen',
  'comfy.connect.securityDirect',
  'comfy.connect.securityTamper',
  'comfy.connect.securityScope',
  'comfy.connect.securityInspect',
] as const;

export function comfySecurityNotes(): string[] {
  return SECURITY_ITEMS.map((key) => t(key));
}
