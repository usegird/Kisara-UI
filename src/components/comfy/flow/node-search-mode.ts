import type { ReferenceTarget } from '@/components/comfy/flow/dialogs/NodeSearchDialog';
import { NO_FILTERS, type SearchFilters } from '@/graph/search';
import type { SearchMode } from '@/hooks/flow/use-node-editing';
import { t } from '@/i18n';

export function searchKey(search: SearchMode | null): string {
  if (search === null) return 'closed';
  if (search.kind === 'append') {
    return search.anchor ? `append:${String(search.anchor.nodeId)}` : 'append';
  }
  if (search.kind === 'between') return `between:${search.linkIds.join(',')}`;

  const widget = search.kind === 'before' ? (search.widget ?? '') : '';
  return `${search.kind}:${String(search.nodeId)}:${String(search.slot)}:${widget}`;
}

export function initialFilters(search: SearchMode | null): SearchFilters | undefined {
  if (search === null || search.kind === 'append') return undefined;
  if (search.kind === 'between') {
    return { ...NO_FILTERS, input: search.slotType, output: search.slotType };
  }

  return search.kind === 'after'
    ? { ...NO_FILTERS, input: search.slotType }
    : { ...NO_FILTERS, output: search.slotType };
}

export function referenceTarget(search: SearchMode | null): ReferenceTarget | null {
  if (search === null || search.kind === 'append' || search.kind === 'between') return null;
  return {
    side: search.kind === 'before' ? 'outputs' : 'inputs',
    exclude: search.nodeId,
    type: search.slotType,
  };
}

export function searchTitle(search: SearchMode): string {
  return search.kind === 'append' && !search.anchor
    ? t('flow.canvas.appendTitle')
    : t('flow.canvas.insertTitle');
}
