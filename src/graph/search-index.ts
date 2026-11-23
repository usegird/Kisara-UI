import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';

type Section = 'core' | 'custom' | 'partner';

export interface IndexedDefinition {
  readonly name: string;
  readonly displayName: string;
  readonly category: string;
  readonly lowerName: string;
  readonly lowerDisplay: string;
  readonly lowerCategory: string;
  readonly path: readonly string[];
  readonly keys: readonly string[];
  readonly inputTypes: ReadonlySet<string>;
  readonly outputTypes: ReadonlySet<string>;
  readonly inputCount: number;
  readonly outputCount: number;
  readonly alphabetical: number;
}

interface TreeTally {
  readonly counts: ReadonlyMap<string, number>;
  readonly labels: ReadonlyMap<string, string>;
  readonly byParent: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface SearchIndex {
  readonly entries: readonly IndexedDefinition[];
  readonly byName: ReadonlyMap<string, IndexedDefinition>;
  readonly byKey: ReadonlyMap<string, readonly IndexedDefinition[]>;
  readonly slotTypes: readonly string[];
  readonly tally: TreeTally;
}

export function typeMembers(type: string): string[] {
  return type
    .split(',')
    .map((member) => member.trim())
    .filter((member) => member.length > 0);
}

function sectionOf(definition: NodeDefinition): Section {
  const head = definition.module.split('.')[0] ?? '';
  if (head === 'nodes' || head === 'comfy_extras') return 'core';
  if (head === 'comfy_api_nodes') return 'partner';
  return 'custom';
}

function membersOf(slots: readonly { readonly type: string }[]): Set<string> {
  const found = new Set<string>();
  for (const slot of slots) for (const member of typeMembers(slot.type)) found.add(member);
  return found;
}

export function addToTally(
  path: readonly string[],
  counts: Map<string, number>,
  labels: Map<string, string>,
  byParent: Map<string, Set<string>>,
): void {
  let parent = '';
  for (const part of path) {
    const key = parent === '' ? part : `${parent}/${part}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    labels.set(key, part);
    byParent.set(parent, (byParent.get(parent) ?? new Set()).add(key));
    parent = key;
  }
}

function buildIndex(definitions: NodeDefinitionMap): SearchIndex {
  const drafts: Omit<IndexedDefinition, 'alphabetical'>[] = [];
  const slotTypes = new Set<string>();

  for (const definition of definitions.values()) {
    const path = [
      sectionOf(definition),
      ...definition.category.split('/').filter((part) => part.length > 0),
    ];
    const keys = path.map((_, index) => path.slice(0, index + 1).join('/'));
    const inputTypes = membersOf(definition.inputs);
    const outputTypes = membersOf(definition.outputs);
    for (const type of inputTypes) slotTypes.add(type);
    for (const type of outputTypes) slotTypes.add(type);

    drafts.push({
      name: definition.name,
      displayName: definition.displayName,
      category: definition.category,
      lowerName: definition.name.toLowerCase(),
      lowerDisplay: definition.displayName.toLowerCase(),
      lowerCategory: definition.category.toLowerCase(),
      path,
      keys,
      inputTypes,
      outputTypes,
      inputCount: definition.inputs.length,
      outputCount: definition.outputs.length,
    });
  }

  const order = drafts
    .map((draft, position) => ({ draft, position }))
    .sort((a, b) => a.draft.displayName.localeCompare(b.draft.displayName));
  const rankOf = new Map(order.map((item, rank) => [item.position, rank]));
  const entries = drafts.map((draft, position): IndexedDefinition => ({
    ...draft,
    alphabetical: rankOf.get(position) ?? 0,
  }));

  const byKey = new Map<string, IndexedDefinition[]>();
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  const byParent = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const key of entry.keys) {
      const list = byKey.get(key);
      if (list) list.push(entry);
      else byKey.set(key, [entry]);
    }
    addToTally(entry.path, counts, labels, byParent);
  }

  slotTypes.delete('COMBO');
  slotTypes.delete('');

  return {
    entries,
    byName: new Map(entries.map((entry) => [entry.name, entry])),
    byKey,
    slotTypes: [...slotTypes].sort((a, b) => a.localeCompare(b)),
    tally: { counts, labels, byParent },
  };
}

const indexes = new WeakMap<NodeDefinitionMap, SearchIndex>();

export function searchIndexOf(definitions: NodeDefinitionMap): SearchIndex {
  const found = indexes.get(definitions);
  if (found) return found;
  const index = buildIndex(definitions);
  indexes.set(definitions, index);
  return index;
}

export function carrySearchIndex(from: NodeDefinitionMap, to: NodeDefinitionMap): void {
  const index = indexes.get(from);
  if (index && !indexes.has(to)) indexes.set(to, index);
}
