import { canUseDepth, isAnchorItem } from '@/chat/prompt';
import {
  ADDITIONAL_INFO_ID,
  defaultComposition,
  type LoreFraming,
  type Persona,
  type PromptComposition,
  type PromptItem,
  type PromptMarker,
  type PromptPosition,
  type PromptRole,
  type UnitLink,
} from '@/chat/types';
import { finiteNumber, isRecord, isUnknownArray } from '@/lib/guards';

const DEFAULT_DEPTH_ORDER = 100;

const ROLES: readonly PromptRole[] = ['system', 'user', 'assistant'];

const PROMPT_MARKERS: readonly PromptMarker[] = [
  'chatHistory',
  'currentInput',
  'additionalInfo',
  'personaDescription',
  'charDescription',
  'charPersonality',
  'scenario',
  'dialogueExamples',
];

function parsePosition(raw: unknown): PromptPosition {
  if (!isRecord(raw) || raw.kind !== 'depth') return { kind: 'relative' };
  const depth = Math.max(0, Math.trunc(finiteNumber(raw.depth) ?? 0));
  return { kind: 'depth', depth, order: finiteNumber(raw.order) ?? DEFAULT_DEPTH_ORDER };
}

function parseItem(raw: unknown): PromptItem | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) return null;
  const marker = PROMPT_MARKERS.find((item) => item === raw.marker) ?? null;
  const role = ROLES.find((item) => item === raw.role) ?? 'system';
  const item: PromptItem = {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    role,
    marker,
    content: marker === null && typeof raw.content === 'string' ? raw.content : '',
    enabled:
      raw.enabled !== false ||
      marker === 'currentInput' ||
      marker === 'chatHistory' ||
      marker === 'additionalInfo',
    position: parsePosition(raw.position),
  };
  return canUseDepth(item) ? item : { ...item, position: { kind: 'relative' } };
}

export function parseComposition(raw: unknown): PromptComposition | null {
  if (!isRecord(raw) || !isUnknownArray(raw.items)) return null;
  const seen = new Set<string>();
  const items = raw.items.flatMap((entry) => {
    const item = parseItem(entry);
    if (item === null || seen.has(item.id)) return [];
    seen.add(item.id);
    return [item];
  });
  const prefill = isRecord(raw.prefill) ? raw.prefill : {};
  const composition: PromptComposition = {
    items: withAdditionalInfo(items),
    prefill: {
      content: typeof prefill.content === 'string' ? prefill.content : '',
      enabled: prefill.enabled === true,
    },
    usePresetOverrides: raw.usePresetOverrides !== false,
  };
  const framing = isRecord(raw.loreFraming) ? raw.loreFraming : {};
  return withLoreFraming(composition, {
    prefix: typeof framing.prefix === 'string' ? framing.prefix : '',
    suffix: typeof framing.suffix === 'string' ? framing.suffix : '',
  });
}

function withAdditionalInfo(items: readonly PromptItem[]): PromptItem[] {
  const first = items.findIndex(isAnchorItem);
  const anchor: PromptItem = {
    id: ADDITIONAL_INFO_ID,
    name: '',
    role: 'system',
    marker: 'additionalInfo',
    content: '',
    enabled: true,
    position: { kind: 'relative' },
  };
  if (first >= 0) {
    return items.flatMap((item, index) => {
      if (!isAnchorItem(item)) return [item];
      return index === first ? [anchor] : [];
    });
  }
  const rest = [...items];
  const history = rest.findIndex((item) => item.marker === 'chatHistory');
  const at = history >= 0 ? history : rest.length;
  rest.splice(at, 0, anchor);
  return rest;
}

function withLoreFraming(composition: PromptComposition, framing: LoreFraming): PromptComposition {
  const empty = framing.prefix.length === 0 && framing.suffix.length === 0;
  return { ...composition, loreFraming: empty ? undefined : framing };
}

export function parsePersona(raw: unknown): Persona | null {
  if (!isRecord(raw)) return null;
  const name = typeof raw.name === 'string' ? raw.name : '';
  const description = typeof raw.description === 'string' ? raw.description : '';
  const persona = { name, description };
  return isEmptyPersona(persona) ? null : persona;
}

export function isEmptyPersona(persona: Persona): boolean {
  return persona.name.length === 0 && persona.description.length === 0;
}

export function parseUnitLink(raw: unknown): UnitLink | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) return null;
  return { id: raw.id, name: typeof raw.name === 'string' ? raw.name : '' };
}

export function compositionOf(raw: Record<string, unknown>): PromptComposition {
  return parseComposition(raw.prompt) ?? defaultComposition();
}
