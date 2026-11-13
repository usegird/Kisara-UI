import type { TagView } from '@/components/comfy/dialogs/TagDictionaryList';
import type { TagRowDraft } from '@/components/comfy/dialogs/TagPanelParts';
import {
  aliasesFromText,
  checkDictionaryName,
  DEFAULT_DICTIONARY,
  DELETED_KIND,
  dictionaryKey,
  findDuplicateTag,
  isDefaultDictionary,
  isDeletedOverride,
  setOverride,
  tagKey,
  type DictionaryNameError,
  type TagDictionary,
  type TagEntry,
  type TagSources,
} from '@/graph/tag-dictionary';
import type { TagChanges } from '@/store/use-tags-store';

// ─────────────────────────────
// タグ辞書の画面の直しかけ（辞書をまたいで持ち、確定でまとめて書く）の作り方と変え方。
// ─────────────────────────────

/** 一覧の 1 つの辞書の直しかけ */
export interface DictionaryDraft {
  readonly name: string;
  readonly rows: readonly TagRowDraft[];
  /** 接続先にファイルがあるか */
  readonly exists: boolean;
  /** 確定で丸ごと書くか（直した・足した） */
  readonly changed: boolean;
  /** 確定でファイルを消すか */
  readonly removed: boolean;
}

/** 画面の直しかけ。`base*` は始めたときの材料で、ストアの材料が変わったかを見分ける */
export interface Draft {
  readonly view: TagView;
  readonly dictionaries: readonly DictionaryDraft[];
  /** 直した pysssss の行（タグの鍵 → 欄の文字。消す印を含む）。確定で上書きに直す */
  readonly pysssssRows: ReadonlyMap<string, PysssssRowDraft>;
  /** 直せる表の最下行の空の行 */
  readonly blank: TagRowDraft;
  readonly baseDictionaries: TagSources['dictionaries'];
  readonly baseOverrides: TagSources['overrides'];
}

/** pysssss の表の 1 行。タグは直せず、別名・優先度と消す印だけを欄の文字のまま持つ */
export interface PysssssRowDraft {
  readonly tag: string;
  readonly aliases: string;
  readonly priority: string;
  readonly removed: boolean;
}

/** 確定の前の確かめで見つかった、同じ辞書の中で重なるタグ */
export interface DuplicateTag {
  readonly dictionary: string;
  readonly tag: string;
}

/** 行の id。描くときの鍵にだけ使う */
let lastRowId = 0;

/** ストアの材料から直しかけを作る。既定の辞書はファイルが無くても空で先頭に置く */
export function startDraft(view: TagView, sources: TagSources): Draft {
  const dictionaries = sources.dictionaries.map((item) => ({
    name: item.name,
    rows: item.entries.map(rowOfEntry),
    exists: true,
    changed: false,
    removed: false,
  }));
  const hasDefault = dictionaries.some((item) => isDefaultDictionary(item.name));
  const fallback = { name: DEFAULT_DICTIONARY, rows: [], exists: false, changed: false };
  return {
    view,
    dictionaries: hasDefault ? dictionaries : [{ ...fallback, removed: false }, ...dictionaries],
    pysssssRows: new Map(),
    blank: emptyRow(),
    baseDictionaries: sources.dictionaries,
    baseOverrides: sources.overrides,
  };
}

/** 確定で書く分があるか */
export function isDirty(draft: Draft): boolean {
  return (
    draft.pysssssRows.size > 0 || draft.dictionaries.some((item) => item.changed || item.removed)
  );
}

/**
 * pysssss の 1 行を直す（消す印の付け外しを含む）。`current` は今表に出している行
 */
export function changePysssssRow(
  draft: Draft,
  key: string,
  current: PysssssRowDraft,
  part: Partial<PysssssRowDraft>,
): Draft {
  const rows = new Map(draft.pysssssRows).set(key, { ...current, ...part });
  return { ...draft, pysssssRows: rows };
}

/**
 * pysssss の行の表に出す中身。直しかけ → 上書き → 元の行の順に採る
 */
export function pysssssRowOf(
  draft: Draft,
  entry: TagEntry,
  override: TagEntry | undefined,
): PysssssRowDraft {
  const touched = draft.pysssssRows.get(tagKey(entry.tag));
  if (touched !== undefined) return touched;
  const removed = override !== undefined && isDeletedOverride(override);
  const shown = override === undefined || removed ? entry : override;
  return {
    tag: entry.tag,
    aliases: shown.aliases.join(', '),
    priority: shown.priority === 0 ? '' : String(shown.priority),
    removed,
  };
}

/** 確定で書く pysssss の上書き。直した行が無ければ null */
function overridesOf(draft: Draft, pysssss: readonly TagEntry[] | null): TagEntry[] | null {
  if (draft.pysssssRows.size === 0) return null;
  const originals = new Map((pysssss ?? []).map((entry) => [tagKey(entry.tag), entry]));
  let next: TagEntry[] = [...draft.baseOverrides];
  for (const [key, row] of draft.pysssssRows) {
    const original = originals.get(key);
    if (original === undefined) continue;
    const edited = row.removed
      ? { ...original, kind: DELETED_KIND }
      : { ...entryOfRow({ ...row, kind: original.kind }), tag: original.tag };
    next = setOverride(next, original, edited);
  }
  return next;
}

/** 見ている辞書。辞書を見ていない・一覧から外れたら undefined */
export function viewedDictionary(draft: Draft): DictionaryDraft | undefined {
  const { view } = draft;
  if (view.kind !== 'dictionary') return undefined;
  return findDraft(draft.dictionaries, view.name);
}

/** 見ている辞書の行を直す。最下行の空の行にタグを入れたら行として足し、その下にまた空の行を出す */
export function changeRow(draft: Draft, id: number, part: Partial<TagRowDraft>): Draft {
  if (id !== draft.blank.id) {
    return updateViewed(draft, (rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...part } : row)),
    );
  }
  const added = updateViewed(draft, (rows) => [...rows, { ...draft.blank, ...part }]);
  return { ...added, blank: emptyRow() };
}

/** 見ている辞書の行に消す印を付ける・外す */
export function toggleRow(draft: Draft, id: number): Draft {
  return updateViewed(draft, (rows) =>
    rows.map((row) => (row.id === id ? { ...row, removed: !row.removed } : row)),
  );
}

/**
 * 辞書に消す印を付ける・外す。まだ確定していない足した辞書は一覧から外し、見ていたら「すべて」へ移る
 */
export function toggleDictionary(draft: Draft, name: string): Draft {
  const key = dictionaryKey(name);
  const target = findDraft(draft.dictionaries, name);
  if (target === undefined) return draft;
  if (!target.exists && !isDefaultDictionary(name)) {
    const viewing = draft.view.kind === 'dictionary' && dictionaryKey(draft.view.name) === key;
    return {
      ...draft,
      view: viewing ? { kind: 'all' } : draft.view,
      dictionaries: draft.dictionaries.filter((item) => item !== target),
    };
  }
  return {
    ...draft,
    dictionaries: draft.dictionaries.map((item) =>
      item === target ? { ...item, removed: !item.removed } : item,
    ),
  };
}

/** 空の辞書を一覧の最後に足して選ぶ。名前が空・重なるなら理由を返す */
export function addDictionary(draft: Draft, name: string): Draft | DictionaryNameError {
  const named = draft.dictionaries.map((item) => ({ name: item.name, entries: [] }));
  const failure = checkDictionaryName(named, name);
  if (failure !== null) return failure;
  const trimmed = name.trim();
  const added = { name: trimmed, rows: [], exists: false, changed: true, removed: false };
  return {
    ...draft,
    view: { kind: 'dictionary', name: trimmed },
    dictionaries: [...draft.dictionaries, added],
  };
}

/** 確定で書く分。重なるタグのある辞書があれば、書かずにそれを返す */
export function changesOf(
  draft: Draft,
  pysssss: readonly TagEntry[] | null,
): TagChanges | DuplicateTag {
  const written: TagDictionary[] = [];
  for (const item of draft.dictionaries) {
    if (item.removed || !item.changed) continue;
    const entries = entriesOf(item.rows);
    const tag = findDuplicateTag(entries);
    if (tag !== null) return { dictionary: item.name, tag };
    written.push({ name: item.name, entries });
  }
  return {
    dictionaries: written,
    removed: draft.dictionaries.filter((item) => item.removed).map((item) => item.name),
    overrides: overridesOf(draft, pysssss),
  };
}

/** 確定で書く行。消す印の行とタグの空の行は外す */
export function entriesOf(rows: readonly TagRowDraft[]): TagEntry[] {
  return rows
    .filter((row) => !row.removed)
    .map(entryOfRow)
    .filter((entry) => entry.tag.length > 0);
}

/** 表の行を辞書の行の形にする（絞り込みの当て方に使う） */
export function entryOfRow(
  row: Pick<TagRowDraft, 'tag' | 'aliases' | 'priority' | 'kind'>,
): TagEntry {
  const priority = Number(row.priority.trim());
  return {
    tag: row.tag.trim(),
    kind: row.kind,
    priority: Number.isFinite(priority) && priority > 0 ? priority : 0,
    aliases: aliasesFromText(row.aliases),
  };
}

function updateViewed(
  draft: Draft,
  change: (rows: readonly TagRowDraft[]) => readonly TagRowDraft[],
): Draft {
  const target = viewedDictionary(draft);
  if (target === undefined) return draft;
  return {
    ...draft,
    dictionaries: draft.dictionaries.map((item) =>
      item === target ? { ...item, rows: change(item.rows), changed: true } : item,
    ),
  };
}

function findDraft(
  dictionaries: readonly DictionaryDraft[],
  name: string,
): DictionaryDraft | undefined {
  const key = dictionaryKey(name);
  return dictionaries.find((item) => dictionaryKey(item.name) === key);
}

function emptyRow(): TagRowDraft {
  lastRowId += 1;
  return { id: lastRowId, tag: '', aliases: '', priority: '', kind: '', removed: false };
}

function rowOfEntry(entry: TagEntry): TagRowDraft {
  return {
    ...emptyRow(),
    tag: entry.tag,
    aliases: entry.aliases.join(', '),
    priority: entry.priority === 0 ? '' : String(entry.priority),
    kind: entry.kind,
  };
}
