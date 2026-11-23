import { MEGABYTE } from '@/lib/file-size';
import { isRecord, stringOr } from '@/lib/guards';
import { findPngText, isPngData } from '@/lib/png-text';

const V1_KEYS = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example'];

function normalizeCard(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  if (raw.spec === 'chara_card_v2' || raw.spec === 'chara_card_v3') {
    return isRecord(raw.data) && typeof raw.data.name === 'string' ? raw : null;
  }
  if (raw.spec !== undefined || typeof raw.name !== 'string') return null;
  if (!V1_KEYS.slice(1).some((key) => typeof raw[key] === 'string')) return null;
  const data: Record<string, unknown> = {};
  for (const key of V1_KEYS) data[key] = stringOr(raw[key]);
  return { spec: 'chara_card_v2', spec_version: '2.0', data };
}

function decodeBase64Json(value: string): unknown {
  const binary = atob(value.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

interface ReadCard {
  readonly card: Record<string, unknown>;
  readonly png: boolean;
}

const CARD_FILE_MAX_MEGABYTES = 32;

export const CARD_FILE_MAX_BYTES = CARD_FILE_MAX_MEGABYTES * MEGABYTE;

export function readCard(buffer: ArrayBuffer): ReadCard | null {
  try {
    if (isPngData(buffer)) {
      const encoded = findPngText(buffer, 'ccv3') ?? findPngText(buffer, 'chara');
      if (encoded === null) return null;
      const card = normalizeCard(decodeBase64Json(encoded));
      return card === null ? null : { card, png: true };
    }
    const card = normalizeCard(JSON.parse(new TextDecoder().decode(buffer)));
    return card === null ? null : { card, png: false };
  } catch {
    return null;
  }
}
