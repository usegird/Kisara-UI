import type {
  InputBranch,
  InputDefinition,
  NodeDefinition,
  NodeDefinitionMap,
  OutputDefinition,
} from '@/graph/types';
import { t } from '@/i18n';
import { reportFault } from '@/lib/fault';
import { isRecord, isUnknownArray } from '@/lib/guards';

const WIDGET_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO']);

const DESCRIPTION_LIMIT = 500;

const DYNAMIC_COMBO_TYPE = 'COMFY_DYNAMICCOMBO_V3';

const MATCH_TYPE = 'COMFY_MATCHTYPE_V3';

const ANY_TYPE = '*';

const BRANCH_SEPARATOR = '.';

function parseInputSpec(
  name: string,
  raw: unknown,
  required: boolean,
  dropOptions: boolean,
): InputDefinition | null {
  if (!isUnknownArray(raw) || raw.length === 0) return null;

  const rawType: unknown = raw[0];
  const config = isRecord(raw[1]) ? raw[1] : {};
  if (rawType === DYNAMIC_COMBO_TYPE) return parseDynamicCombo(name, config, required, dropOptions);
  if (rawType === MATCH_TYPE) return parseMatchType(name, config, required);

  let type: string;
  let options: readonly unknown[] | null = null;

  if (isUnknownArray(rawType)) {
    type = 'COMBO';
    options = rawType;
  } else if (typeof rawType === 'string') {
    type = rawType;
    if (type === 'COMBO') {
      options = isUnknownArray(config.options) ? config.options : null;
    }
  } else {
    return null;
  }

  const isWidget = WIDGET_TYPES.has(type) && config.forceInput !== true;

  return { name, type, required, isWidget, options: dropOptions ? null : options, config };
}

function parseDynamicCombo(
  name: string,
  config: Record<string, unknown>,
  required: boolean,
  dropOptions: boolean,
): InputDefinition {
  const rawOptions = isUnknownArray(config.options) ? config.options : [];
  const branches = rawOptions.flatMap((option): InputBranch[] => {
    if (!isRecord(option) || typeof option.key !== 'string') return [];
    const inputs = isRecord(option.inputs) ? option.inputs : {};
    return [{ key: option.key, inputs: parseGroups(inputs, null, dropOptions, name) }];
  });
  const rest = Object.fromEntries(
    Object.entries(config).filter(([key]) => key !== 'options' && key !== 'default'),
  );
  return {
    name,
    type: 'COMBO',
    required,
    isWidget: true,
    options: branches.map((branch) => branch.key),
    config: rest,
    branches,
  };
}

function parseMatchType(
  name: string,
  config: Record<string, unknown>,
  required: boolean,
): InputDefinition {
  const template = isRecord(config.template) ? config.template : {};
  const allowed = template.allowed_types;
  const id = template.template_id;
  const rest = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'template'));
  const base = { name, required, isWidget: false, options: null, config: rest };
  if (typeof id !== 'string' || typeof allowed !== 'string') return { ...base, type: ANY_TYPE };
  return { ...base, type: allowed, matchType: id };
}

function parseGroups(
  input: Record<string, unknown>,
  inputOrder: Record<string, unknown> | null,
  dropOptions: boolean,
  prefix: string | null = null,
): InputDefinition[] {
  const inputs: InputDefinition[] = [];
  for (const group of ['required', 'optional'] as const) {
    const specs = isRecord(input[group]) ? input[group] : {};
    for (const name of inputNames(inputOrder?.[group], specs)) {
      const fullName = prefix === null ? name : `${prefix}${BRANCH_SEPARATOR}${name}`;
      const parsed = parseInputSpec(fullName, specs[name], group === 'required', dropOptions);
      if (parsed) inputs.push(parsed);
    }
  }
  return inputs;
}

function inputNames(order: unknown, specs: Record<string, unknown>): string[] {
  if (isUnknownArray(order)) {
    const ordered = order.filter((n): n is string => typeof n === 'string');
    const known = new Set(ordered);
    return [...ordered, ...Object.keys(specs).filter((n) => !known.has(n))];
  }
  return Object.keys(specs);
}

function parseOutputs(entry: Record<string, unknown>): OutputDefinition[] {
  const types = isUnknownArray(entry.output) ? entry.output : [];
  const names = isUnknownArray(entry.output_name) ? entry.output_name : [];
  const matchTypes = isUnknownArray(entry.output_matchtypes) ? entry.output_matchtypes : [];

  return types.map((rawType, index) => {
    const type = isUnknownArray(rawType) ? 'COMBO' : String(rawType);
    const rawName: unknown = names[index];
    const name = typeof rawName === 'string' ? rawName : type;
    const matchType: unknown = matchTypes[index];
    if (typeof matchType === 'string') return { name, type: ANY_TYPE, matchType };
    return { name, type };
  });
}

interface BuildDefinitionOptions {
  readonly dropOptions?: boolean;
}

export function buildNodeDefinition(
  className: string,
  raw: unknown,
  options: BuildDefinitionOptions = {},
): NodeDefinition | null {
  if (!isRecord(raw)) return null;
  const dropOptions = options.dropOptions === true;

  const input = isRecord(raw.input) ? raw.input : {};
  const inputOrder = isRecord(raw.input_order) ? raw.input_order : {};
  const inputs = parseGroups(input, inputOrder, dropOptions);

  const displayName =
    typeof raw.display_name === 'string' && raw.display_name.length > 0
      ? raw.display_name
      : className;

  return {
    name: className,
    displayName,
    category: typeof raw.category === 'string' ? raw.category : '',
    module: typeof raw.python_module === 'string' ? raw.python_module : '',
    inputs,
    outputs: parseOutputs(raw),
    outputNode: raw.output_node === true,
    description:
      typeof raw.description === 'string' ? raw.description.slice(0, DESCRIPTION_LIMIT) : '',
  };
}

export function buildNodeDefinitions(
  raw: unknown,
  options: BuildDefinitionOptions = { dropOptions: true },
): NodeDefinitionMap {
  const map = new Map<string, NodeDefinition>();
  if (!isRecord(raw)) return map;
  for (const [className, entry] of Object.entries(raw)) {
    addDefinition(map, className, entry, options);
  }
  return map;
}

const SLICE_SIZE = 200;

export async function buildNodeDefinitionsInSlices(
  raw: unknown,
  pause: () => Promise<void>,
  options: BuildDefinitionOptions = { dropOptions: true },
): Promise<NodeDefinitionMap> {
  const map = new Map<string, NodeDefinition>();
  if (!isRecord(raw)) return map;
  const entries = Object.entries(raw);
  for (let start = 0; start < entries.length; start += SLICE_SIZE) {
    if (start > 0) await pause();
    for (const [className, entry] of entries.slice(start, start + SLICE_SIZE)) {
      addDefinition(map, className, entry, options);
    }
  }
  return map;
}

function addDefinition(
  map: Map<string, NodeDefinition>,
  className: string,
  entry: unknown,
  options: BuildDefinitionOptions,
): void {
  try {
    const definition = buildNodeDefinition(className, entry, options);
    if (definition) map.set(className, definition);
  } catch (error) {
    reportFault(t('fault.where.nodeDefinition', { name: className }), error);
  }
}

export function needsOptions(definition: NodeDefinition): boolean {
  return someMissingOptions(definition.inputs);
}

function someMissingOptions(inputs: readonly InputDefinition[]): boolean {
  return inputs.some(
    (input) =>
      (input.type === 'COMBO' && input.options === null) ||
      (input.branches ?? []).some((branch) => someMissingOptions(branch.inputs)),
  );
}
