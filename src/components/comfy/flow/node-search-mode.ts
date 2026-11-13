import type { ReferenceTarget } from '@/components/comfy/flow/dialogs/NodeSearchDialog';
import { NO_FILTERS, type SearchFilters } from '@/graph/search';
import type { SearchMode } from '@/hooks/flow/use-node-editing';
import { t } from '@/i18n';

// ─────────────────────────────
// ノードの検索の開き方（起点のスロット・線）から、検索の鍵・絞り込みの初期値・ノード参照の起点・見出しを決める
// ─────────────────────────────

/** 開き直すたびに検索の状態を作り直すための鍵。起点が変われば別のものとして扱う */
export function searchKey(search: SearchMode | null): string {
  if (search === null) return 'closed';
  if (search.kind === 'append') {
    return search.anchor ? `append:${String(search.anchor.nodeId)}` : 'append';
  }
  if (search.kind === 'between') return `between:${search.linkIds.join(',')}`;

  const widget = search.kind === 'before' ? (search.widget ?? '') : '';
  return `${search.kind}:${String(search.nodeId)}:${String(search.slot)}:${widget}`;
}

/** 呼び出し元のスロットから、検索の絞り込みの初期値を決める */
export function initialFilters(search: SearchMode | null): SearchFilters | undefined {
  if (search === null || search.kind === 'append') return undefined;
  // 線に挟むので、その型を受けられて出せるノード
  if (search.kind === 'between') {
    return { ...NO_FILTERS, input: search.slotType, output: search.slotType };
  }

  return search.kind === 'after'
    ? { ...NO_FILTERS, input: search.slotType }
    : { ...NO_FILTERS, output: search.slotType };
}

/**
 * ノード参照の起点。入力から開いたら接続元の出力を、
 * 出力から開いたら接続先の入力を選ぶ。末尾に足すときは起点が無い
 */
export function referenceTarget(search: SearchMode | null): ReferenceTarget | null {
  if (search === null || search.kind === 'append' || search.kind === 'between') return null;
  return {
    side: search.kind === 'before' ? 'outputs' : 'inputs',
    exclude: search.nodeId,
    type: search.slotType,
  };
}

/** 検索の見出し。末尾に足すときだけ言い分ける */
export function searchTitle(search: SearchMode): string {
  return search.kind === 'append' && !search.anchor
    ? t('flow.canvas.appendTitle')
    : t('flow.canvas.insertTitle');
}
