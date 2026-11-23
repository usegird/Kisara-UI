import type { WorkflowNode } from '@/graph/types';

const CORE_PACK_ID = 'comfy-core';

const URL_KEY = /^https?:\/\//i;

export interface NodePackMapping {
  readonly key: string;
  readonly title: string;
  readonly nodes: readonly string[];
  readonly pattern: string | null;
}

export interface MissingNodeType {
  readonly classType: string;
  readonly cnrId: string | null;
}

export interface NodePackCandidate {
  readonly key: string;
  readonly title: string;
  readonly registry: boolean;
  readonly nodes: readonly string[];
}

export interface NodePackResolution {
  readonly packs: readonly NodePackCandidate[];
  readonly unresolved: readonly string[];
}

export function cnrIdOf(node: WorkflowNode | undefined): string | null {
  const value = node?.properties?.cnr_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function resolveNodePacks(
  missing: readonly MissingNodeType[],
  mappings: readonly NodePackMapping[],
): NodePackResolution {
  const byKey = new Map(mappings.map((mapping) => [mapping.key, mapping]));
  const packs = new Map<string, { title: string; nodes: string[] }>();
  const unresolved: string[] = [];

  const add = (key: string, classType: string): void => {
    const entry = packs.get(key);
    if (entry !== undefined) {
      if (!entry.nodes.includes(classType)) entry.nodes.push(classType);
      return;
    }
    packs.set(key, { title: byKey.get(key)?.title ?? key, nodes: [classType] });
  };

  for (const { classType, cnrId } of uniqueTypes(missing)) {
    if (cnrId !== null && cnrId !== CORE_PACK_ID) {
      add(cnrId, classType);
      continue;
    }
    const found = mappings.find((mapping) => providesNode(mapping, classType));
    if (found === undefined) unresolved.push(classType);
    else add(found.key, classType);
  }

  return {
    packs: [...packs].map(([key, { title, nodes }]) => ({
      key,
      title,
      registry: !URL_KEY.test(key),
      nodes,
    })),
    unresolved,
  };
}

function uniqueTypes(missing: readonly MissingNodeType[]): MissingNodeType[] {
  const map = new Map<string, MissingNodeType>();
  for (const entry of missing) {
    const current = map.get(entry.classType);
    if (current === undefined || (current.cnrId === null && entry.cnrId !== null)) {
      map.set(entry.classType, entry);
    }
  }
  return [...map.values()];
}

function providesNode(mapping: NodePackMapping, classType: string): boolean {
  if (mapping.nodes.includes(classType)) return true;
  if (mapping.pattern === null) return false;
  try {
    return new RegExp(mapping.pattern).test(classType);
  } catch {
    return false;
  }
}
