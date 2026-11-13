import { useEffect, useState } from 'react';

import {
  addDictionary,
  changePysssssRow,
  changeRow,
  changesOf,
  entryOfRow,
  isDirty,
  pysssssRowOf,
  startDraft,
  toggleDictionary,
  toggleRow,
  viewedDictionary,
  type Draft,
  type PysssssRowDraft,
} from '@/components/comfy/dialogs/tag-panel-draft';
import {
  nextTagSort,
  sortTagRows,
  type TagSort,
  type TagSortFields,
  type TagSortKey,
} from '@/components/comfy/dialogs/tag-table-sort';
import type { TagView } from '@/components/comfy/dialogs/TagDictionaryList';
import type { PysssssRowView, TagRowDraft } from '@/components/comfy/dialogs/TagPanelParts';
import { matchTags } from '@/graph/tag-complete';
import {
  indexTags,
  overrideMap,
  tagKey,
  type IndexedTag,
  type TagEntry,
  type TagSources,
} from '@/graph/tag-dictionary';
import { t, type MessageKey } from '@/i18n';
import { useDialogStore } from '@/store/use-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { TAG_PANEL_DIALOG, useTagsStore, type TagCommitFailure } from '@/store/use-tags-store';

// ─────────────────────────────
// タグ辞書の画面の状態と手続き（見ている一覧・辞書をまたいだ直しかけ・閉じる前の確かめ）。
// 直しかけは辞書を選び直しても持ち続け、確定でまとめて書く。
// ─────────────────────────────

/** 表に出す行の上限（10 万件を描かないため） */
const MAX_ROWS = 200;

const FAILURE_TEXT = {
  'empty-name': 'tags.errors.emptyName',
  'duplicate-name': 'tags.errors.duplicateName',
  'not-loaded': 'tags.errors.notLoaded',
} as const satisfies Record<TagCommitFailure, MessageKey>;

type Sources = TagSources & { readonly merged: readonly IndexedTag[] };

/** タグ辞書の画面の状態と手続き */
export function useTagPanel() {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const store = useTagsData(baseUrl);
  const commit = useTagsStore((state) => state.commit);
  const refresh = useTagsStore((state) => state.refresh);

  const [draft, setDraft] = useState(() => startDraft({ kind: 'all' }, store));
  const [query, setQuery] = useState('');
  // 並べ替えは画面の中だけ（閉じたら今までの並びに戻る）
  const [sort, setSort] = useState<TagSort | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = isDirty(draft);
  // ストアの材料が変わった（取り直した・確定した）ら、直しかけが無ければ描画中に作り直す
  const stale =
    draft.baseDictionaries !== store.dictionaries || draft.baseOverrides !== store.overrides;
  if (stale && !dirty) setDraft(startDraft(draft.view, store));
  const guard = useCloseGuard(dirty);
  const edit = (change: (current: Draft) => Draft): void => {
    setError(null);
    setDraft(change);
  };

  const confirm = async (): Promise<void> => {
    const changes = changesOf(draft, store.pysssss);
    if ('tag' in changes) {
      setDraft({ ...draft, view: { kind: 'dictionary', name: changes.dictionary } });
      setError(t('tags.errors.duplicateTag', { name: changes.tag }));
      return;
    }
    const failure = await commit(baseUrl, changes);
    if (failure === 'failed') return;
    if (failure !== null) {
      setError(t(FAILURE_TEXT[failure]));
      return;
    }
    const next = startDraft(draft.view, useTagsStore.getState());
    setError(null);
    setDraft(viewedDictionary(next) === undefined ? { ...next, view: { kind: 'all' } } : next);
  };

  return {
    baseUrl,
    store,
    draft,
    dirty,
    query,
    setQuery,
    error,
    ...guard,
    sort,
    changeSort: (key: TagSortKey) => setSort((current) => nextTagSort(current, key)),
    ...tableOf(draft, store, query, sort),
    refresh: () => void refresh(baseUrl),
    confirm: () => void confirm(),
    selectView: (view: TagView) => edit((current) => ({ ...current, view })),
    changeRow: (id: number, part: Partial<TagRowDraft>) =>
      edit((current) => changeRow(current, id, part)),
    toggleRow: (id: number) => edit((current) => toggleRow(current, id)),
    toggleDictionary: (name: string) => edit((current) => toggleDictionary(current, name)),
    addDictionary: (name: string): string | null => {
      const next = addDictionary(draft, name);
      if (typeof next === 'string') return t(FAILURE_TEXT[next]);
      edit(() => next);
      return null;
    },
    changePysssssRow: (row: PysssssRowView, part: Partial<PysssssRowDraft>) =>
      edit((current) => changePysssssRow(current, row.key, row.row, part)),
  };
}

/** 画面が読むストアの値 */
function useTagsData(baseUrl: string) {
  return {
    status: useTagsStore((state) => state.status),
    loaded: useTagsStore((state) => state.loadedFrom !== null && state.loadedFrom === baseUrl),
    error: useTagsStore((state) => state.error),
    pysssss: useTagsStore((state) => state.pysssss),
    dictionaries: useTagsStore((state) => state.dictionaries),
    overrides: useTagsStore((state) => state.overrides),
    merged: useTagsStore((state) => state.merged),
  };
}

/**
 * 直しかけを捨てることになる閉じ方の前に確かめる。外（アイコンの押し直し・ほかの埋め込み）から
 * 閉じるよう頼まれたときも、直しかけがあれば確かめる
 */
function useCloseGuard(dirty: boolean) {
  const close = useTagsStore((state) => state.closePanel);
  const closeRequested = useTagsStore((state) => state.closeRequested);
  const clearCloseRequest = useTagsStore((state) => state.clearCloseRequest);
  const reclaimDialog = useDialogStore((state) => state.reclaim);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (closeRequested && !dirty) close();
  }, [closeRequested, dirty, close]);

  return {
    requestClose: () => {
      if (dirty) setPending(true);
      else close();
    },
    confirming: pending || (closeRequested && dirty),
    discard: () => {
      setPending(false);
      close();
    },
    cancelDiscard: () => {
      setPending(false);
      // ほかの埋め込みが開いて閉じるよう頼まれていたなら、この画面に留まる（開いた方を閉じる）
      if (closeRequested) reclaimDialog(TAG_PANEL_DIALOG);
      clearCloseRequest();
    },
  };
}

// ─────────────────────────────
// 表の行
// ─────────────────────────────

/** 表に出す行と、当たった件数（直せる辞書・pysssss・読むだけのどれか 1 つ） */
function tableOf(draft: Draft, sources: Sources, query: string, sort: TagSort | null) {
  const viewed = viewedDictionary(draft);
  if (viewed !== undefined && !viewed.removed) {
    return { editable: editableRows(viewed.rows, query, sort), readOnly: null, pysssss: null };
  }
  if (viewed === undefined && draft.view.kind === 'pysssss') {
    return { editable: null, readOnly: null, pysssss: pysssssRows(draft, sources, query, sort) };
  }
  const listed =
    viewed === undefined ? sources.merged : indexTags(viewed.rows.map(entryOfRow), null);
  const matched = sortedMatches(listed, query, sort, (tag) => tag.entry);
  const rows = matched.shown.map((tag) => ({
    key: tag.source === null ? tag.key : `${tag.source}:${tag.key}`,
    tag: tag.entry.tag,
    aliases: tag.entry.aliases,
    priority: tag.entry.priority,
    // 消す印の辞書は全行に取り消し線を引く
    struck: viewed !== undefined,
  }));
  return { editable: null, readOnly: { rows, total: matched.total }, pysssss: null };
}

/**
 * pysssss の表の行。直しかけ・上書きを当てた値で当て、並べる。消した行も取り消し線で出す
 */
function pysssssRows(draft: Draft, sources: Sources, query: string, sort: TagSort | null) {
  const overrides = overrideMap(sources.overrides);
  const rowOf = new Map<TagEntry, PysssssRowView>();
  const entries = (sources.pysssss ?? []).map((original) => {
    const key = tagKey(original.tag);
    const row = pysssssRowOf(draft, original, overrides.get(key));
    const entry = entryOfRow({ ...row, kind: original.kind });
    rowOf.set(entry, { key, row });
    return entry;
  });
  const matched = sortedMatches(indexTags(entries, null), query, sort, (tag) => tag.entry);
  const rows = matched.shown.map((tag) => rowOf.get(tag.entry));
  return { rows: rows.filter((row) => row !== undefined), total: matched.total };
}

/** 直せる表の行。語が無ければ辞書の行の順、あれば補完と同じ当て方で並べる */
function editableRows(rows: readonly TagRowDraft[], query: string, sort: TagSort | null) {
  if (query.trim().length === 0) {
    const sorted = sortTagRows(rows, sort, (row) => fieldsOf(entryOfRow(row)));
    return { rows: sorted.slice(0, MAX_ROWS), total: rows.length };
  }
  const rowOf = new Map<TagEntry, TagRowDraft>();
  const entries = rows.map((row) => {
    const entry = entryOfRow(row);
    rowOf.set(entry, row);
    return entry;
  });
  const matched = sortedMatches(indexTags(entries, null), query, sort, (tag) => tag.entry);
  const found = matched.shown.map((tag) => rowOf.get(tag.entry));
  return { rows: found.filter((row) => row !== undefined), total: matched.total };
}

/**
 * 当てて、並べ替えを選んでいれば当たった全部を並べ替えてから上限で切る
 * （先に切ると、並べ替えた先頭が当て方の上位 200 件の中だけになる）
 */
function sortedMatches(
  tags: readonly IndexedTag[],
  query: string,
  sort: TagSort | null,
  entryOf: (tag: IndexedTag) => TagEntry,
): { readonly shown: IndexedTag[]; readonly total: number } {
  const { matches, total } = matchTags(tags, query, sort === null ? MAX_ROWS : Infinity);
  const found = matches.map(({ tag }) => tag);
  const sorted = sortTagRows(found, sort, (tag) => fieldsOf(entryOf(tag)));
  return { shown: sorted.slice(0, MAX_ROWS), total };
}

function fieldsOf(entry: TagEntry): TagSortFields {
  return { tag: entry.tag, aliases: entry.aliases.join(','), priority: entry.priority };
}
