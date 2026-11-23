import {
  addToTally,
  searchIndexOf,
  typeMembers,
  type IndexedDefinition,
  type SearchIndex,
} from '@/graph/search-index';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import { t, type MessageKey } from '@/i18n';
import {
  compareSearchRank,
  loweredSearchRank,
  searchQuery,
  type SearchRank,
} from '@/lib/search-terms';

const MAX_RESULTS = 64;

const ANY_TYPE = '*';

export interface SearchFilters {
  readonly group: string;
  readonly input: string;
  readonly output: string;
  readonly anyType: boolean;
}

export const NO_FILTERS: SearchFilters = {
  group: '',
  input: '',
  output: '',
  anyType: true,
};

export function hasFilters(filters: SearchFilters): boolean {
  return filters.group !== '' || filters.input !== '' || filters.output !== '' || !filters.anyType;
}

export { typeMembers };

export function slotTypeMatches(slotType: string, type: string, anyType: boolean): boolean {
  const slot = typeMembers(slotType);
  const wanted = typeMembers(type);
  if (slot.some((member) => wanted.includes(member))) return true;
  return anyType && (slot.includes(ANY_TYPE) || wanted.includes(ANY_TYPE));
}

type UsedTypes = ReadonlySet<string>;

interface GroupContext {
  readonly used: UsedTypes;
  readonly frequency: readonly string[];
}

const NO_GROUP_CONTEXT: GroupContext = { used: new Set(), frequency: [] };

interface GroupMembers {
  readonly used: UsedTypes;
  readonly frequent: ReadonlySet<string> | 'all';
}

const NO_MEMBERS: GroupMembers = { used: new Set(), frequent: new Set() };

const FREQUENT_LIMIT = 64;

function groupMembers(
  definitions: NodeDefinitionMap,
  terms: readonly string[],
  filters: SearchFilters,
  { used, frequency }: GroupContext,
): GroupMembers {
  if (frequency.length === 0) return { used, frequent: NO_MEMBERS.frequent };
  if (terms.length > 0 || filters.input !== '' || filters.output !== '') {
    return { used, frequent: 'all' };
  }

  const top = new Set<string>();
  for (const name of frequency) {
    if (top.size >= FREQUENT_LIMIT) break;
    if (definitions.has(name)) top.add(name);
  }
  return { used, frequent: top };
}

export function slotTypesOf(definitions: NodeDefinitionMap): string[] {
  return [...searchIndexOf(definitions).slotTypes];
}

interface SearchOptions {
  readonly filters?: SearchFilters | undefined;
  readonly context?: GroupContext | undefined;
  readonly limit?: number | undefined;
}

function termScore(entry: IndexedDefinition, term: string): number {
  if (entry.lowerDisplay.startsWith(term) || entry.lowerName.startsWith(term)) return 0;
  if (entry.lowerDisplay.includes(term) || entry.lowerName.includes(term)) return 1;
  if (entry.lowerCategory.includes(term)) return 2;
  return -1;
}

function score(entry: IndexedDefinition, terms: readonly string[]): number {
  let best = -1;
  for (const term of terms) {
    const rank = termScore(entry, term);
    if (rank >= 0 && (best < 0 || rank < best)) best = rank;
  }
  return best;
}

function hasIndexedType(
  types: ReadonlySet<string>,
  slotCount: number,
  type: string,
  anyType: boolean,
): boolean {
  const wanted = typeMembers(type);
  if (wanted.some((member) => types.has(member))) return true;
  return anyType && (types.has(ANY_TYPE) || (slotCount > 0 && wanted.includes(ANY_TYPE)));
}

function matchesTypes(entry: IndexedDefinition, filters: SearchFilters): boolean {
  if (
    filters.input !== '' &&
    !hasIndexedType(entry.inputTypes, entry.inputCount, filters.input, filters.anyType)
  ) {
    return false;
  }
  return (
    filters.output === '' ||
    hasIndexedType(entry.outputTypes, entry.outputCount, filters.output, filters.anyType)
  );
}

function candidatesOf(
  index: SearchIndex,
  group: string,
  members: GroupMembers,
): readonly IndexedDefinition[] {
  const named = (names: Iterable<string>): IndexedDefinition[] =>
    [...names].flatMap((name) => index.byName.get(name) ?? []);

  if (group === '') return index.entries;
  if (group === FREQUENT) {
    return members.frequent === 'all' ? index.entries : named(members.frequent);
  }
  if (group === 'used') return named(members.used);
  return index.byKey.get(group) ?? [];
}

function uniqueTypes(slots: readonly { readonly type: string }[]): string {
  const types = slots.map((slot) => typeMembers(slot.type).join('|')).filter((type) => type !== '');
  return [...new Set(types)].join(', ');
}

export function topCategory(definition: NodeDefinition): string {
  return definition.category.split('/')[0] ?? '';
}

export function slotSummary(definition: NodeDefinition): {
  readonly inputs: string;
  readonly outputs: string;
} {
  return {
    inputs: uniqueTypes(definition.inputs.filter((input) => !input.isWidget)),
    outputs: uniqueTypes(definition.outputs),
  };
}

export function searchDefinitions(
  definitions: NodeDefinitionMap,
  query: string,
  { filters = NO_FILTERS, context = NO_GROUP_CONTEXT, limit = MAX_RESULTS }: SearchOptions = {},
): NodeDefinition[] {
  const index = searchIndexOf(definitions);
  const wanted = searchQuery(query);
  const members = groupMembers(definitions, wanted.terms, filters, context);
  const scored: { entry: IndexedDefinition; rank: number; order: SearchRank }[] = [];

  for (const entry of candidatesOf(index, filters.group, members)) {
    if (!matchesTypes(entry, filters)) continue;

    const rank = wanted.terms.length === 0 ? 0 : score(entry, wanted.terms);
    if (rank < 0) continue;

    const order = loweredSearchRank(wanted, {
      names: [entry.lowerDisplay, entry.lowerName],
      texts: [entry.lowerDisplay, entry.lowerName, entry.lowerCategory],
    });
    scored.push({ entry, rank, order });
  }

  const often = filters.group === FREQUENT ? frequencyRank(context.frequency) : null;
  const byFrequency = (entry: IndexedDefinition): number =>
    often?.get(entry.name) ?? Number.MAX_SAFE_INTEGER;

  return scored
    .sort(
      (a, b) =>
        compareSearchRank(a.order, b.order) ||
        a.rank - b.rank ||
        byFrequency(a.entry) - byFrequency(b.entry) ||
        a.entry.alphabetical - b.entry.alphabetical,
    )
    .slice(0, limit)
    .flatMap((item) => definitions.get(item.entry.name) ?? []);
}

const FREQUENT = 'frequent';

const GROUP_LABELS = {
  [FREQUENT]: 'graph.search.groups.frequent',
  used: 'graph.search.groups.used',
  custom: 'graph.search.groups.custom',
  partner: 'graph.search.groups.partner',
} as const satisfies Record<string, MessageKey>;

function frequencyRank(frequency: readonly string[]): Map<string, number> {
  return new Map(frequency.map((name, index) => [name, index]));
}

function groupPaths(
  path: readonly string[],
  name: string,
  members: GroupMembers,
): (readonly string[])[] {
  const paths: (readonly string[])[] = [path];
  if (members.frequent === 'all' || members.frequent.has(name)) paths.push([FREQUENT]);
  if (members.used.has(name)) paths.push(['used']);
  return paths;
}

export interface CategoryNode {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly children: readonly CategoryNode[];
}

interface GroupTree {
  readonly total: number;
  readonly leading: readonly CategoryNode[];
  readonly nodes: readonly CategoryNode[];
}

export function defaultGroup(context: GroupContext): string {
  return context.frequency.length > 0 ? FREQUENT : '';
}

export function groupTree(
  definitions: NodeDefinitionMap,
  query: string,
  filters: SearchFilters = NO_FILTERS,
  context: GroupContext = NO_GROUP_CONTEXT,
): GroupTree {
  const index = searchIndexOf(definitions);
  const { terms } = searchQuery(query);
  const members = groupMembers(definitions, terms, filters, context);

  if (terms.length === 0 && filters.input === '' && filters.output === '') {
    const count = (names: ReadonlySet<string> | 'all'): number =>
      names === 'all'
        ? index.entries.length
        : [...names].filter((name) => index.byName.has(name)).length;
    const lead = (key: typeof FREQUENT | 'used', size: number): CategoryNode[] =>
      size > 0 ? [{ key, label: t(GROUP_LABELS[key]), count: size, children: [] }] : [];
    return {
      total: index.entries.length,
      leading: [...lead(FREQUENT, count(members.frequent)), ...lead('used', count(members.used))],
      nodes: plainNodes(index),
    };
  }

  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  const byParent = new Map<string, Set<string>>();
  let total = 0;

  for (const entry of index.entries) {
    if (!matchesTypes(entry, filters)) continue;
    if (terms.length > 0 && score(entry, terms) < 0) continue;

    total += 1;
    for (const path of groupPaths(entry.path, entry.name, members)) {
      addToTally(path, counts, labels, byParent);
    }
  }

  return treeOf({ counts, labels, byParent }, total);
}

interface Tally {
  readonly counts: ReadonlyMap<string, number>;
  readonly labels: ReadonlyMap<string, string>;
  readonly byParent: ReadonlyMap<string, ReadonlySet<string>>;
}

function treeOf({ counts, labels, byParent }: Tally, total: number): GroupTree {
  const label = (key: string): string => labels.get(key) ?? key;
  const node = (key: string): CategoryNode => ({
    key,
    label: label(key),
    count: counts.get(key) ?? 0,
    children: build(key),
  });
  const build = (parent: string): CategoryNode[] =>
    [...(byParent.get(parent) ?? [])]
      .sort(
        (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || label(a).localeCompare(label(b)),
      )
      .map(node);

  const section = (key: keyof typeof GROUP_LABELS): CategoryNode[] =>
    counts.has(key) ? [{ ...node(key), label: t(GROUP_LABELS[key]) }] : [];

  return {
    total,
    leading: [...section(FREQUENT), ...section('used')],
    nodes: [...build('core'), ...section('custom'), ...section('partner')],
  };
}

const plainTrees = new WeakMap<SearchIndex, readonly CategoryNode[]>();

function plainNodes(index: SearchIndex): readonly CategoryNode[] {
  const found = plainTrees.get(index);
  if (found) return found;
  const { nodes } = treeOf(index.tally, index.entries.length);
  plainTrees.set(index, nodes);
  return nodes;
}
