import { linkIndex } from '@/graph/link-read';
import {
  nodeInputs,
  nodeOutputs,
  slotTypeName,
  subgraphDefinitions,
  type InputDefinition,
  type LinkId,
  type NodeDefinitionMap,
  type NodeId,
  type ResolvedLink,
  type Workflow,
  type WorkflowLink,
  type WorkflowNode,
} from '@/graph/types';

const ANY_TYPE = '*';
const TYPE_SEPARATOR = ',';

interface MatchSpec {
  readonly group: string;
  readonly allowed: string;
}

interface Level {
  readonly nodes: readonly WorkflowNode[];
  readonly links: ReadonlyMap<LinkId, ResolvedLink>;
}

export function withMatchedTypes(workflow: Workflow, definitions: NodeDefinitionMap): Workflow {
  if (definitions.size === 0) return workflow;
  const nodes = matchLevel(workflow.nodes, workflow.links, definitions);
  const subgraphs = subgraphDefinitions(workflow);
  const nextSubgraphs = subgraphs.map((subgraph) => {
    const inner = matchLevel(subgraph.nodes, subgraph.links, definitions);
    return inner === subgraph.nodes ? subgraph : { ...subgraph, nodes: inner };
  });
  const subgraphsChanged = nextSubgraphs.some((subgraph, index) => subgraph !== subgraphs[index]);
  if (nodes === workflow.nodes && !subgraphsChanged) return workflow;
  return {
    ...workflow,
    nodes,
    ...(subgraphsChanged
      ? { definitions: { ...workflow.definitions, subgraphs: nextSubgraphs } }
      : {}),
  };
}

function matchLevel(
  nodes: WorkflowNode[],
  links: readonly WorkflowLink[],
  definitions: NodeDefinitionMap,
): WorkflowNode[] {
  const specs = new Map<NodeId, ReadonlyMap<string, MatchSpec>>();
  for (const node of nodes) {
    const found = matchSpecsOf(node, definitions);
    if (found.size > 0) specs.set(node.id, found);
  }
  if (specs.size === 0) return nodes;
  const index = linkIndex(links);
  let current = nodes;
  for (let round = 0; round <= specs.size; round += 1) {
    const level: Level = { nodes: current, links: index };
    let changed = false;
    const next = current.map((node) => {
      const nodeSpecs = specs.get(node.id);
      if (nodeSpecs === undefined) return node;
      const matched = matchNode(node, nodeSpecs, definitions, level);
      if (matched !== node) changed = true;
      return matched;
    });
    if (!changed) break;
    current = next;
  }
  return current;
}

function matchSpecsOf(
  node: WorkflowNode,
  definitions: NodeDefinitionMap,
): ReadonlyMap<string, MatchSpec> {
  const specs = new Map<string, MatchSpec>();
  const definition = definitions.get(node.type);
  if (definition === undefined) return specs;
  const visit = (inputs: readonly InputDefinition[]): void => {
    for (const input of inputs) {
      if (input.matchType !== undefined) {
        specs.set(input.name, { group: input.matchType, allowed: input.type });
      }
      for (const branch of input.branches ?? []) visit(branch.inputs);
    }
  };
  visit(definition.inputs);
  return specs;
}

function matchNode(
  node: WorkflowNode,
  specs: ReadonlyMap<string, MatchSpec>,
  definitions: NodeDefinitionMap,
  level: Level,
): WorkflowNode {
  const inputs = nodeInputs(node);
  const linked = inputs.map((input) => linkedTypeOf(input.link, level));
  const groupTypes = (group: string, skip: number): string[] =>
    inputs.flatMap((input, slot) =>
      slot !== skip && specs.get(input.name)?.group === group ? [linked[slot] ?? ANY_TYPE] : [],
    );
  const nextInputs = inputs.map((input, slot) => {
    const spec = specs.get(input.name);
    if (spec === undefined) return input;
    const type = commonType([...groupTypes(spec.group, slot), spec.allowed]) ?? spec.allowed;
    return slotTypeName(input.type) === type ? input : { ...input, type };
  });
  const outputDefinitions = definitions.get(node.type)?.outputs ?? [];
  const outputs = nodeOutputs(node);
  const nextOutputs = outputs.map((output, slot) => {
    const group = outputDefinitions[slot]?.matchType;
    if (group === undefined) return output;
    const type = commonType(groupTypes(group, -1)) ?? ANY_TYPE;
    return slotTypeName(output.type) === type ? output : { ...output, type };
  });
  const inputsChanged = nextInputs.some((input, slot) => input !== inputs[slot]);
  const outputsChanged = nextOutputs.some((output, slot) => output !== outputs[slot]);
  if (!inputsChanged && !outputsChanged) return node;
  return {
    ...node,
    ...(inputsChanged ? { inputs: nextInputs } : {}),
    ...(outputsChanged ? { outputs: nextOutputs } : {}),
  };
}

function linkedTypeOf(linkId: LinkId | null, level: Level): string {
  if (linkId === null) return ANY_TYPE;
  const link = level.links.get(linkId);
  if (link === undefined) return ANY_TYPE;
  const origin = level.nodes.find((node) => node.id === link.originId);
  const output = nodeOutputs(origin)[link.originSlot];
  return output === undefined ? link.type : slotTypeName(output.type);
}

export function commonType(types: readonly string[]): string | null {
  const concrete = types.filter((type) => type !== ANY_TYPE && type.length > 0);
  const [first, ...rest] = concrete.map((type) => type.split(TYPE_SEPARATOR));
  if (first === undefined) return ANY_TYPE;
  const shared = [...new Set(first)].filter((member) =>
    rest.every((members) => members.includes(member)),
  );
  return shared.length === 0 ? null : shared.join(TYPE_SEPARATOR);
}
