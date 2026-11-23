import {
  MAIN_PROMPT_ID,
  type PromptComposition,
  type PromptItem,
  type PromptMarker,
  type PromptPosition,
  type PromptRole,
} from '@/chat/types';

export function isAnchorItem(item: PromptItem): boolean {
  return item.marker === 'additionalInfo';
}

export function isFixedItem(item: PromptItem): boolean {
  return item.marker === 'chatHistory' || item.marker === 'currentInput';
}

export function canUseDepth(item: PromptItem): boolean {
  return !isFixedItem(item) && !isAnchorItem(item);
}

export function roleOf(items: readonly PromptItem[], item: PromptItem): PromptRole {
  if (item.position.kind === 'depth') return item.role;
  if (item.marker === 'currentInput') return 'user';
  const anchor =
    items.findIndex((entry) => entry.marker === 'chatHistory') >= 0
      ? items.findIndex((entry) => entry.marker === 'chatHistory')
      : items.findIndex((entry) => entry.marker === 'currentInput');
  if (anchor < 0) return 'system';
  return items.indexOf(item) < anchor ? 'system' : 'user';
}

function mainPromptText(composition: PromptComposition): string {
  const main = composition.items.find((item) => item.id === MAIN_PROMPT_ID);
  return main?.enabled === true && main.marker === null ? main.content : '';
}

export function leadingSystemText(chat: { readonly prompt: PromptComposition }): string {
  return mainPromptText(chat.prompt);
}

export type PromptItemPatch = Partial<Pick<PromptItem, 'name' | 'role' | 'content' | 'enabled'>> & {
  readonly position?: PromptPosition;
};

export function updatePromptItem(
  composition: PromptComposition,
  id: string,
  patch: PromptItemPatch,
): PromptComposition | null {
  const index = composition.items.findIndex((item) => item.id === id);
  const item = composition.items[index];
  if (item === undefined) return null;
  if (patch.content !== undefined && item.marker !== null) return null;
  if (patch.position?.kind === 'depth' && !canUseDepth(item)) return null;
  if (patch.enabled === false && (isFixedItem(item) || isAnchorItem(item))) {
    return null;
  }
  const next: PromptItem = { ...item, ...patch };
  if (JSON.stringify(next) === JSON.stringify(item)) return null;
  const items = [...composition.items];
  items[index] = next;
  return { ...composition, items };
}

type PromptPlace = 'before' | 'input' | 'after';

function placeIndex(items: readonly PromptItem[], place: PromptPlace): number {
  const end = items.length;
  if (place === 'after') return end;
  if (place === 'input') {
    const at = items.findIndex((entry) => entry.marker === 'currentInput');
    return at >= 0 ? Math.min(at + 1, end) : end;
  }
  const history = items.findIndex((entry) => entry.marker === 'chatHistory');
  const input = items.findIndex((entry) => entry.marker === 'currentInput');
  if (history >= 0) return history;
  return input >= 0 ? input : end;
}

export function addPromptItem(
  composition: PromptComposition,
  id: string,
  place: PromptPlace = 'before',
  name = '',
): PromptComposition {
  const item: PromptItem = {
    id,
    name,
    role: 'system',
    marker: null,
    content: '',
    enabled: true,
    position: { kind: 'relative' },
  };
  const items = [...composition.items];
  items.splice(placeIndex(items, place), 0, item);
  return { ...composition, items };
}

export function removePromptItem(
  composition: PromptComposition,
  id: string,
): PromptComposition | null {
  const item = composition.items.find((entry) => entry.id === id);
  if (item === undefined || isFixedItem(item) || isAnchorItem(item)) return null;
  return { ...composition, items: composition.items.filter((entry) => entry.id !== id) };
}

export function updatePrefill(
  composition: PromptComposition,
  patch: Partial<PromptComposition['prefill']>,
): PromptComposition | null {
  const prefill = { ...composition.prefill, ...patch };
  if (
    prefill.content === composition.prefill.content &&
    prefill.enabled === composition.prefill.enabled
  ) {
    return null;
  }
  return { ...composition, prefill };
}

const STATIC_SOURCE_MARKERS: readonly PromptMarker[] = [
  'personaDescription',
  'charDescription',
  'charPersonality',
  'dialogueExamples',
];

export function withSourceMarkers(composition: PromptComposition): PromptComposition {
  const missing = (markers: readonly PromptMarker[]): PromptItem[] =>
    markers
      .filter((marker) => !composition.items.some((item) => item.marker === marker))
      .map((marker) => ({
        id: marker,
        name: '',
        role: 'system',
        marker,
        content: '',
        enabled: true,
        position: { kind: 'relative' },
      }));
  const before = missing(STATIC_SOURCE_MARKERS);
  const after = missing(['scenario']);
  if (before.length + after.length === 0) return composition;
  const items = [...composition.items];
  const anchor = items.findIndex(isAnchorItem);
  if (anchor >= 0) {
    items.splice(anchor + 1, 0, ...after);
    items.splice(anchor, 0, ...before);
  } else {
    const at = items.findIndex((item) => item.id === MAIN_PROMPT_ID) + 1;
    items.splice(at, 0, ...before, ...after);
  }
  return { ...composition, items };
}

interface PromptSectionView {
  readonly kind: 'before' | 'history' | 'after';
  readonly items: readonly PromptItem[];
}

export function inInsertOrder(items: readonly PromptItem[]): PromptItem[] {
  const key = (item: PromptItem): readonly [number, number] =>
    item.position.kind === 'depth' ? [item.position.depth, item.position.order] : [-1, 0];
  return items
    .map((item, index) => ({ item, index, key: key(item) }))
    .sort((a, b) => b.key[0] - a.key[0] || a.key[1] - b.key[1] || a.index - b.index)
    .map(({ item }) => item);
}

export function sectionViews(composition: PromptComposition): PromptSectionView[] {
  const items = composition.items;
  const depth = inInsertOrder(items.filter((item) => item.position.kind === 'depth'));
  const relative = items.filter((item) => item.position.kind === 'relative');
  const history = relative.find((item) => item.marker === 'chatHistory');
  const before = relative.filter((item) => item !== history && roleOf(items, item) === 'system');
  const after = relative.filter((item) => item !== history && roleOf(items, item) === 'user');
  const sections: PromptSectionView[] = [
    { kind: 'before', items: before },
    { kind: 'history', items: history === undefined ? depth : [history, ...depth] },
    { kind: 'after', items: after },
  ];
  return sections.filter((section) => section.items.length > 0);
}

export type DropSlot = 'before' | 'after' | 'input' | 'fixed';

export function dropSlots(composition: PromptComposition): ReadonlyMap<string, DropSlot> {
  const slots = new Map<string, DropSlot>();
  for (const view of sectionViews(composition)) {
    for (const item of view.items) {
      const slot: DropSlot =
        view.kind === 'before'
          ? 'before'
          : view.kind === 'history'
            ? 'fixed'
            : item.marker === 'currentInput'
              ? 'input'
              : 'after';
      slots.set(item.id, slot);
    }
  }
  return slots;
}

export function moveToSlot(
  original: PromptComposition,
  id: string,
  prevId: string | null,
  nextId: string | null,
): PromptComposition | null {
  const find = (key: string | null): PromptItem | undefined =>
    key === null ? undefined : original.items.find((item) => item.id === key);
  const active = find(id);
  if (active === undefined || isFixedItem(active) || isAnchorItem(active)) {
    return null;
  }
  const prev = find(prevId);
  const next = find(nextId);
  const items = original.items.filter((item) => item.id !== id);
  const slots = dropSlots(original);
  const nextSlot = next === undefined ? undefined : slots.get(next.id);
  const intoBand = nextSlot === 'fixed' || nextSlot === 'input';
  const prevSlot = prev === undefined ? undefined : slots.get(prev.id);
  const at = intoBand
    ? prevSlot === undefined || prevSlot === 'before'
      ? placeIndex(items, 'before')
      : placeIndex(items, 'input')
    : next !== undefined
      ? items.indexOf(next)
      : prev !== undefined
        ? items.indexOf(prev) + 1
        : placeIndex(items, 'after');
  items.splice(at, 0, { ...active, position: { kind: 'relative' } });
  const moved = { ...original, items };
  return JSON.stringify(moved.items) === JSON.stringify(original.items) ? null : moved;
}
