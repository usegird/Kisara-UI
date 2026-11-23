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

export interface DictionaryDraft {
  readonly name: string;
  readonly rows: readonly TagRowDraft[];
  readonly exists: boolean;
  readonly changed: boolean;
}

export interface Draft {
  readonly view: TagView;
  readonly dictionaries: readonly DictionaryDraft[];
  readonly pysssssRows: ReadonlyMap<string, PysssssRowDraft>;
  readonly blank: TagRowDraft;
  readonly baseDictionaries: TagSources['dictionaries'];
  readonly baseOverrides: TagSources['overrides'];
}

export interface PysssssRowDraft {
  readonly tag: string;
  readonly aliases: string;
  readonly priority: string;
  readonly removed: boolean;
}

export interface DuplicateTag {
  readonly dictionary: string;
  readonly tag: string;
}

let lastRowId = 0;

export function startDraft(view: TagView, sources: TagSources): Draft {
  const dictionaries = sources.dictionaries.map((item) => ({
    name: item.name,
    rows: item.entries.map(rowOfEntry),
    exists: true,
    changed: false,
  }));
  const hasDefault = dictionaries.some((item) => isDefaultDictionary(item.name));
  const fallback = { name: DEFAULT_DICTIONARY, rows: [], exists: false, changed: false };
  return {
    view,
    dictionaries: hasDefault ? dictionaries : [fallback, ...dictionaries],
    pysssssRows: new Map(),
    blank: emptyRow(),
    baseDictionaries: sources.dictionaries,
    baseOverrides: sources.overrides,
  };
}

export function isDirty(draft: Draft): boolean {
  return draft.pysssssRows.size > 0 || draft.dictionaries.some((item) => item.changed);
}

export function changePysssssRow(
  draft: Draft,
  key: string,
  current: PysssssRowDraft,
  part: Partial<PysssssRowDraft>,
): Draft {
  const rows = new Map(draft.pysssssRows).set(key, { ...current, ...part });
  return { ...draft, pysssssRows: rows };
}

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

export function viewedDictionary(draft: Draft): DictionaryDraft | undefined {
  const { view } = draft;
  if (view.kind !== 'dictionary') return undefined;
  return findDraft(draft.dictionaries, view.name);
}

export function changeRow(draft: Draft, id: number, part: Partial<TagRowDraft>): Draft {
  if (id !== draft.blank.id) {
    return updateViewed(draft, (rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...part } : row)),
    );
  }
  const added = updateViewed(draft, (rows) => [...rows, { ...draft.blank, ...part }]);
  return { ...added, blank: emptyRow() };
}

export function toggleRow(draft: Draft, id: number): Draft {
  return updateViewed(draft, (rows) =>
    rows.map((row) => (row.id === id ? { ...row, removed: !row.removed } : row)),
  );
}

export function addDictionary(draft: Draft, name: string): Draft | DictionaryNameError {
  const named = draft.dictionaries.map((item) => ({ name: item.name, entries: [] }));
  const failure = checkDictionaryName(named, name);
  if (failure !== null) return failure;
  const trimmed = name.trim();
  const added = { name: trimmed, rows: [], exists: false, changed: true };
  return {
    ...draft,
    view: { kind: 'dictionary', name: trimmed },
    dictionaries: [...draft.dictionaries, added],
  };
}

export function changesOf(
  draft: Draft,
  pysssss: readonly TagEntry[] | null,
): TagChanges | DuplicateTag {
  const written: TagDictionary[] = [];
  for (const item of draft.dictionaries) {
    if (!item.changed) continue;
    const entries = entriesOf(item.rows);
    const tag = findDuplicateTag(entries);
    if (tag !== null) return { dictionary: item.name, tag };
    written.push({ name: item.name, entries });
  }
  return { dictionaries: written, overrides: overridesOf(draft, pysssss) };
}

export function entriesOf(rows: readonly TagRowDraft[]): TagEntry[] {
  return rows
    .filter((row) => !row.removed)
    .map(entryOfRow)
    .filter((entry) => entry.tag.length > 0);
}

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
