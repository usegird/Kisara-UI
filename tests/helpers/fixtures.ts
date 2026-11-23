import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildNodeDefinitions } from '@/graph/node-definition';
import { parseWorkflow, subgraphDefinitions } from '@/graph/normalize';
import type { NodeDefinitionMap, Workflow, WorkflowNode } from '@/graph/types';

export const SAMPLE_FILES = [
  'image_flux2.json',
  'image_qwen_image_edit_2509.json',
  'video_ltx2_3_i2v.json',
] as const;

export const LAYOUT_SAMPLE_FILES = [
  'Illustrious_vPred_XL_comfyui_newbie (1).json',
  'Illustrious_vPred_XL_comfyui_newbie (2).json',
  'Krea2_T2I (1).json',
  'krea2SimpleWorkflow_test.json',
] as const;

export type SampleFile = (typeof SAMPLE_FILES)[number] | (typeof LAYOUT_SAMPLE_FILES)[number];

function readJson(relativePath: string): unknown {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function loadWorkflow(name: SampleFile): Workflow {
  return parseWorkflow(readJson(`../../workflow_sample/${name}`));
}

export function loadDefinitions(): NodeDefinitionMap {
  return buildNodeDefinitions(readJson('../fixtures/object-info.subset.json'));
}

export function allNodes(workflow: Workflow): { node: WorkflowNode; where: string }[] {
  const result = workflow.nodes.map((node) => ({ node, where: 'root' }));

  for (const definition of subgraphDefinitions(workflow)) {
    for (const node of definition.nodes) {
      result.push({ node, where: `subgraph:${definition.name}` });
    }
  }
  return result;
}
