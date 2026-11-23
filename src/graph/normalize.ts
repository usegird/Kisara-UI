import { linkIndex, readLink } from '@/graph/link-read';
import {
  nodeInputs,
  nodeOutputs,
  type LinkId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { t } from '@/i18n';
import { isRecord, isUnknownArray } from '@/lib/guards';

class WorkflowParseError extends Error {}

function isNode(value: unknown): value is WorkflowNode {
  return isRecord(value) && typeof value.id === 'number' && typeof value.type === 'string';
}

export function emptyWorkflow(): Workflow {
  return {
    last_node_id: 0,
    last_link_id: 0,
    nodes: [],
    links: [],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  };
}

export function parseWorkflow(value: unknown): Workflow {
  if (!isRecord(value)) {
    throw new WorkflowParseError(t('graph.parse.notObject'));
  }
  if (!isUnknownArray(value.nodes)) {
    throw new WorkflowParseError(t('graph.parse.noNodes'));
  }
  if (!isUnknownArray(value.links)) {
    throw new WorkflowParseError(t('graph.parse.noLinks'));
  }
  const invalid = value.nodes.findIndex((node) => !isNode(node));
  if (invalid >= 0) {
    throw new WorkflowParseError(t('graph.parse.invalidNode', { index: String(invalid) }));
  }
  const seen = new Set<number>();
  for (const [index, node] of value.nodes.entries()) {
    const id = isNode(node) ? node.id : null;
    if (id === null) continue;
    if (seen.has(id)) {
      throw new WorkflowParseError(
        t('graph.parse.duplicateNode', { id: String(id), index: String(index) }),
      );
    }
    seen.add(id);
  }

  return value as unknown as Workflow;
}

export { subgraphDefinitions } from '@/graph/types';

export function removeDanglingLinks(workflow: Workflow): Workflow {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  const index = linkIndex(workflow.links);

  const aliveLinks = new Set<LinkId>();
  for (const [id, link] of index) {
    if (nodeIds.has(link.originId) && nodeIds.has(link.targetId)) aliveLinks.add(id);
  }

  if (aliveLinks.size === index.size) {
    const untouched = workflow.nodes.every(
      (node) =>
        nodeInputs(node).every((input) => input.link === null || aliveLinks.has(input.link)) &&
        nodeOutputs(node).every((output) => (output.links ?? []).every((id) => aliveLinks.has(id))),
    );
    if (untouched) return workflow;
  }

  const nodes = workflow.nodes.map((node) => {
    const inputs = !Array.isArray(node.inputs)
      ? undefined
      : nodeInputs(node).map((input) =>
          input.link !== null && !aliveLinks.has(input.link) ? { ...input, link: null } : input,
        );
    const outputs = !Array.isArray(node.outputs)
      ? undefined
      : nodeOutputs(node).map((output) => {
          if (!output.links) return output;
          const links = output.links.filter((id) => aliveLinks.has(id));
          return links.length === output.links.length ? output : { ...output, links };
        });

    return {
      ...node,
      ...(inputs ? { inputs } : {}),
      ...(outputs ? { outputs } : {}),
    };
  });

  return {
    ...workflow,
    nodes,
    links: workflow.links.filter((link) => {
      const resolved = readLink(link);
      return resolved !== null && aliveLinks.has(resolved.id);
    }),
  };
}
