import { selectedCandidate } from '@/chat/edit';
import { applyMacros, type PromptSources } from '@/chat/macros';
import type { SemanticHits } from '@/chat/semantic';
import { estimateText } from '@/chat/tokens';
import type {
  ChatMessage,
  LoreFraming,
  PromptComposition,
  PromptItem,
  PromptRole,
} from '@/chat/types';

const PERCENT = 100;

export const DEFAULT_SCAN_DEPTH = 2;

const BUDGET_RATIO = 0.25;

export const NO_FRAMING: LoreFraming = { prefix: '', suffix: '' };

const FIRST_LOREBOOK_ID = 'lorebook-1';

export type LoreLogic = 'or' | 'and' | 'nor' | 'nand' | 'rag';

export interface LoreEntry {
  readonly keys: readonly string[];
  readonly secondaryKeys: readonly string[];
  readonly logic: LoreLogic;
  readonly probability: number;
  readonly caseSensitive: boolean;
  readonly content: string;
  readonly enabled: boolean;
  readonly constant: boolean;
  readonly side: 'before' | 'after';
  readonly depth: { readonly depth: number; readonly role: PromptRole } | null;
  readonly historyStart: boolean;
  readonly scanDepth: number | null;
  readonly order: number;
  readonly priority: number;
  readonly comment: string;
}

export interface Lorebook {
  readonly name: string;
  readonly entries: readonly LoreEntry[];
  readonly scanDepth?: number | undefined;
}

export interface OwnLorebook extends Lorebook {
  readonly id: string;
  readonly off?: true | undefined;
}

export function loreBudget(context: number | null): number {
  return context === null || context <= 0 ? 0 : Math.floor(context * BUDGET_RATIO);
}

export interface LoreOptions {
  readonly budget: number;
  readonly framing: LoreFraming;
  readonly roll?: (() => number) | undefined;
  readonly semantic?: SemanticHits | undefined;
}

export interface LoreSource {
  readonly id: string;
  readonly entries: readonly LoreEntry[];
  readonly budgetFirst?: boolean | undefined;
  readonly scanDepth?: number | undefined;
}

export interface LoreResult {
  readonly additional: string;
  readonly depthItems: readonly PromptItem[];
  readonly hits: ReadonlyMap<string, ReadonlySet<number>>;
}

const NO_LORE: LoreResult = { additional: '', depthItems: [], hits: new Map() };

const DEPTH_ORDER = 100;

function spokenTexts(messages: readonly ChatMessage[]): string[] {
  return messages
    .map((message) => selectedCandidate(message)?.content ?? '')
    .filter((content) => content.length > 0);
}

function matchesAny(
  keys: readonly string[],
  target: string,
  entry: LoreEntry,
  macro: (text: string) => string,
): boolean {
  const haystack = entry.caseSensitive ? target : target.toLowerCase();
  return keys.some((raw) => {
    const key = macro(raw).trim();
    if (key.length === 0) return false;
    return haystack.includes(entry.caseSensitive ? key : key.toLowerCase());
  });
}

function isActive(
  entry: LoreEntry,
  spoken: readonly string[],
  macro: (text: string) => string,
  scan: { readonly near: boolean; readonly scanDepth: number },
): boolean {
  if (!entry.enabled || entry.content.trim().length === 0) return false;
  if (entry.constant) return true;
  if (entry.logic === 'rag') return scan.near;
  const depth = entry.scanDepth ?? scan.scanDepth;
  const target = depth <= 0 ? '' : spoken.slice(-depth).join('\n');
  if (!matchesAny(entry.keys, target, entry, macro)) return false;
  return passesCondition(entry, target, macro);
}

function passesCondition(
  entry: LoreEntry,
  target: string,
  macro: (text: string) => string,
): boolean {
  if (entry.secondaryKeys.length === 0) return true;
  const hit = (key: string): boolean => matchesAny([key], target, entry, macro);
  switch (entry.logic) {
    case 'or':
      return entry.secondaryKeys.some(hit);
    case 'and':
      return entry.secondaryKeys.every(hit);
    case 'nor':
      return !entry.secondaryKeys.some(hit);
    case 'nand':
      return !entry.secondaryKeys.every(hit);
    case 'rag':
      return true;
  }
}

function passesProbability(entry: LoreEntry, roll: (() => number) | undefined): boolean {
  if (roll === undefined || entry.probability >= PERCENT) return true;
  return roll() * PERCENT < entry.probability;
}

interface Hit {
  readonly entry: LoreEntry;
  readonly source: number;
  readonly index: number;
  readonly first: boolean;
}

function withinBudget(active: readonly Hit[], budget: number): Hit[] {
  if (budget <= 0) return [...active];
  const ordered = [...active].sort(
    (a, b) =>
      Number(b.first) - Number(a.first) ||
      a.source - b.source ||
      b.entry.priority - a.entry.priority ||
      a.index - b.index,
  );
  const kept: Hit[] = [];
  let used = 0;
  for (const item of ordered) {
    const cost = estimateText(item.entry.content);
    if (used + cost > budget) continue;
    used += cost;
    kept.push(item);
  }
  return kept;
}

function wrap(contents: readonly string[], framing: LoreFraming): string {
  if (contents.length === 0) return '';
  return [framing.prefix, ...contents, framing.suffix]
    .filter((part) => part.trim().length > 0)
    .join('\n\n');
}

function distinctSources(sources: readonly LoreSource[]): LoreSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}

export function loreInsertion(
  entry: LoreEntry,
  historyCount: number,
): { readonly depth: number; readonly role: PromptRole } | null {
  return entry.historyStart ? { depth: historyCount, role: 'system' } : entry.depth;
}

export function activateLore(
  sources: readonly LoreSource[],
  messages: readonly ChatMessage[],
  options: LoreOptions,
  macro: (text: string) => string,
): LoreResult {
  const spoken = spokenTexts(messages);
  const distinct = distinctSources(sources);
  const active = distinct.flatMap((source, sourceIndex) =>
    source.entries.flatMap((entry, index): Hit[] =>
      isActive(entry, spoken, macro, {
        near: options.semantic?.get(source.id)?.has(index) === true,
        scanDepth: (source.scanDepth ?? DEFAULT_SCAN_DEPTH) + 1,
      }) && passesProbability(entry, options.roll)
        ? [{ entry, source: sourceIndex, index, first: source.budgetFirst === true }]
        : [],
    ),
  );
  const sideRank = (entry: LoreEntry): number => (entry.side === 'before' ? 0 : 1);
  const kept = withinBudget(active, options.budget).sort(
    (a, b) =>
      a.source - b.source ||
      sideRank(a.entry) - sideRank(b.entry) ||
      a.entry.order - b.entry.order ||
      a.index - b.index,
  );

  const historyCount = messages.length + 1;
  const additional = wrap(
    kept
      .filter(({ entry }) => loreInsertion(entry, historyCount) === null)
      .map(({ entry }) => entry.content),
    options.framing,
  );
  const groups = new Map<string, { depth: number; role: PromptRole; contents: string[] }>();
  for (const { entry } of kept) {
    const insertion = loreInsertion(entry, historyCount);
    if (insertion === null) continue;
    const key = `${insertion.depth}:${insertion.role}`;
    const group = groups.get(key) ?? { ...insertion, contents: [] };
    group.contents.push(entry.content);
    groups.set(key, group);
  }
  const depthItems = [...groups].map(([key, group]): PromptItem => ({
    id: `:lore:${key}`,
    name: '',
    role: group.role,
    marker: null,
    content: wrap(group.contents, options.framing),
    enabled: true,
    position: { kind: 'depth', depth: group.depth, order: DEPTH_ORDER },
  }));
  const hits = new Map<string, Set<number>>();
  for (const { source, index } of kept) {
    const id = distinct[source]?.id;
    if (id === undefined) continue;
    const set = hits.get(id) ?? new Set<number>();
    set.add(index);
    hits.set(id, set);
  }
  return { additional, depthItems, hits };
}

export interface LoreScan {
  readonly messages: readonly ChatMessage[];
  readonly context: number | null;
  readonly roll?: (() => number) | undefined;
  readonly semantic?: SemanticHits | undefined;
}

export function chatLore(
  sources: readonly LoreSource[],
  composition: PromptComposition,
  names: Pick<PromptSources, 'userName' | 'charName' | 'variables'>,
  { messages, context, roll, semantic }: LoreScan,
): LoreResult {
  if (sources.length === 0) return NO_LORE;
  const macroSources: PromptSources = { ...names, markerText: () => '' };
  const options: LoreOptions = {
    budget: loreBudget(context),
    framing: composition.loreFraming ?? NO_FRAMING,
    roll,
    semantic,
  };
  return activateLore(sources, messages, options, (text) => applyMacros(text, macroSources));
}

export function withLore(base: PromptSources, lore: LoreResult): PromptSources {
  return {
    ...base,
    markerText: (marker) =>
      marker === 'additionalInfo' ? lore.additional : base.markerText(marker),
    extraItems: [...(base.extraItems ?? []), ...lore.depthItems],
  };
}

export function lorebookList(book: Lorebook | null): OwnLorebook[] {
  if (book === null) return [];
  return [{ id: FIRST_LOREBOOK_ID, ...book }];
}

export function lorebookEntries(books: readonly OwnLorebook[]): LoreEntry[] {
  return books.flatMap((book) => book.entries);
}

export function savedLorebooks(books: readonly OwnLorebook[]): OwnLorebook[] {
  return books.map(({ id, name, entries, scanDepth }) => ({
    id,
    name,
    entries,
    ...(scanDepth === undefined ? {} : { scanDepth }),
  }));
}
