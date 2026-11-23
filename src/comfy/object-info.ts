import { fetchJson, type RequestOptions } from '@/comfy/client';
import { objectInfoClassUrl, objectInfoUrl } from '@/comfy/endpoints';
import { buildNodeDefinition, buildNodeDefinitionsInSlices } from '@/graph/node-definition';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import { isRecord } from '@/lib/guards';
import { yieldToMain } from '@/lib/yield-to-main';

export async function fetchNodeDefinitions(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<NodeDefinitionMap> {
  const raw = await fetchJson(objectInfoUrl(baseUrl), options);
  return buildNodeDefinitionsInSlices(raw, yieldToMain);
}

export async function fetchNodeDefinition(
  baseUrl: string,
  className: string,
  options: RequestOptions = {},
): Promise<NodeDefinition | null> {
  const raw = await fetchJson(objectInfoClassUrl(baseUrl, className), options);
  if (!isRecord(raw)) return null;

  return buildNodeDefinition(className, raw[className]);
}
