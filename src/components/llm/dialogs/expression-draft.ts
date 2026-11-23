import { normalizeExpressionLabel, type ExpressionSet } from '@/chat/avatar-expression';
import type { ImportedExpression } from '@/chat/avatar-expression-import';
import { newShortId } from '@/lib/id';

export interface DraftItem {
  readonly id: string;
  readonly label: string;
  readonly image: Blob;
}

export interface ExpressionDraft {
  readonly items: readonly DraftItem[];
  readonly defaultId: string;
  readonly selectedId: string | null;
  readonly dirty: boolean;
}

export type LabelProblem = 'empty' | 'tooLong' | 'duplicate';

export function draftOf(set: ExpressionSet): ExpressionDraft {
  const items = set.items.map((item) => ({ id: newShortId(), ...item }));
  const fallback = items.find((item) => item.label === set.defaultLabel) ?? items[0];
  const defaultId = fallback?.id ?? '';
  return { items, defaultId, selectedId: null, dirty: false };
}

export function expressionSetOf(draft: ExpressionDraft): ExpressionSet {
  const fallback = draft.items.find((item) => item.id === draft.defaultId);
  return {
    defaultLabel: fallback?.label ?? '',
    items: draft.items.map(({ label, image }) => ({ label, image })),
  };
}

export function renameItem(
  draft: ExpressionDraft,
  id: string,
  raw: string,
): ExpressionDraft | LabelProblem {
  const label = normalizeExpressionLabel(raw);
  if (label === null) return raw.trim().length === 0 ? 'empty' : 'tooLong';
  if (draft.items.some((item) => item.id !== id && item.label === label)) return 'duplicate';
  const current = draft.items.find((item) => item.id === id);
  if (current === undefined || current.label === label) return draft;
  return changed(draft, {
    items: draft.items.map((item) => (item.id === id ? { ...item, label } : item)),
  });
}

export function setDefault(draft: ExpressionDraft, id: string): ExpressionDraft {
  return draft.defaultId === id ? draft : changed(draft, { defaultId: id });
}

export function replaceItemImage(draft: ExpressionDraft, id: string, image: Blob): ExpressionDraft {
  return changed(draft, {
    items: draft.items.map((item) => (item.id === id ? { ...item, image } : item)),
  });
}

export function removeItem(draft: ExpressionDraft, id: string): ExpressionDraft {
  if (id === draft.defaultId) return draft;
  if (!draft.items.some((item) => item.id === id)) return draft;
  const items = draft.items.filter((item) => item.id !== id);
  return changed(draft, { items, selectedId: null });
}

export function mergeImported(
  draft: ExpressionDraft,
  entries: readonly ImportedExpression[],
): { readonly draft: ExpressionDraft; readonly added: number; readonly replaced: number } {
  if (entries.length === 0) return { draft, added: 0, replaced: 0 };
  let items = [...draft.items];
  let added = 0;
  let replaced = 0;
  let selectedId: string | null = draft.selectedId;
  for (const entry of entries) {
    const same = items.find((item) => item.label === entry.label);
    if (same === undefined) {
      const item = { id: newShortId(), label: entry.label, image: entry.image };
      items = [...items, item];
      selectedId = item.id;
      added += 1;
    } else {
      items = items.map((item) => (item.id === same.id ? { ...item, image: entry.image } : item));
      selectedId = same.id;
      replaced += 1;
    }
  }
  return { draft: changed(draft, { items, selectedId }), added, replaced };
}

function changed(draft: ExpressionDraft, patch: Partial<ExpressionDraft>): ExpressionDraft {
  return { ...draft, ...patch, dirty: true };
}
