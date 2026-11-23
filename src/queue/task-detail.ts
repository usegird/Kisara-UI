import { normalizeModelName } from '@/graph/model-files';
import type { NodeDefinitionMap } from '@/graph/types';
import type { MessageKey } from '@/i18n';
import { isUnknownArray } from '@/lib/guards';
import type { PromptNode } from '@/port/run';
import type { NodeTiming } from '@/queue/execution-state';

const MODEL_FILE = /\.(safetensors|ckpt|pt|pth|bin|gguf|sft|onnx|vae|clip)$/i;

export function isModelFile(value: string): boolean {
  return MODEL_FILE.test(value);
}

const ROLE_PATTERN = {
  positive: /^pos(itive)?(_?\d+)?$/i,
  negative: /^neg(ative)?(_?\d+)?$/i,
} as const;

export type PromptRole = keyof typeof ROLE_PATTERN;

const ROLES: readonly PromptRole[] = ['positive', 'negative'];

export function linkedNodeId(value: unknown): string | null {
  if (!isUnknownArray(value)) return null;

  const id: unknown = value[0];
  return typeof id === 'string' ? id : typeof id === 'number' ? String(id) : null;
}

export function classifyRoles(nodes: ReadonlyMap<string, PromptNode>): Map<string, PromptRole> {
  const marks = new Map<string, Set<PromptRole>>();
  const queue = roleSeeds(nodes);

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;

    const current = marks.get(next.id) ?? new Set<PromptRole>();
    if (current.has(next.role)) continue;

    current.add(next.role);
    marks.set(next.id, current);

    const node = nodes.get(next.id);
    for (const value of Object.values(node?.inputs ?? {})) {
      const upstream = linkedNodeId(value);
      if (upstream !== null) queue.push({ id: upstream, role: next.role });
    }
  }

  const roles = new Map<string, PromptRole>();
  for (const [id, set] of marks) {
    const [only] = [...set];
    if (set.size === 1 && only !== undefined) roles.set(id, only);
  }
  return roles;
}

function roleSeeds(
  nodes: ReadonlyMap<string, PromptNode>,
): { readonly id: string; readonly role: PromptRole }[] {
  const seeds: { readonly id: string; readonly role: PromptRole }[] = [];
  for (const node of nodes.values()) {
    for (const [name, value] of Object.entries(node.inputs)) {
      const role = ROLES.find((candidate) => ROLE_PATTERN[candidate].test(name));
      if (role === undefined) continue;

      const upstream = linkedNodeId(value);
      if (upstream !== null) seeds.push({ id: upstream, role });
    }
  }
  return seeds;
}

export interface TaskPrompt {
  readonly nodeId: string;
  readonly classType: string;
  readonly inputName: string;
  readonly text: string;
  readonly role: PromptRole | null;
}

export interface ModelUse {
  readonly file: string;
  readonly input: string;
}

interface TaskSummary {
  readonly models: readonly ModelUse[];
  readonly prompts: readonly TaskPrompt[];
}

export type ModelKind = 'model' | 'lora' | 'other';

export const MODEL_KINDS: readonly ModelKind[] = ['model', 'lora', 'other'];

export type ModelGroups = Readonly<Record<ModelKind, readonly string[]>>;

export interface ModelKindNames {
  readonly modelNames: ReadonlySet<string>;
  readonly loraNames: ReadonlySet<string>;
}

const LORA_INPUT = /lora/iu;
const OTHER_INPUT = /vae|clip|encoder/iu;

export function modelKindOf(value: string, inputName: string, names: ModelKindNames): ModelKind {
  const name = normalizeModelName(value);
  if (names.loraNames.has(name)) return 'lora';
  if (names.modelNames.has(name)) return 'model';
  if (names.loraNames.size > 0 || names.modelNames.size > 0) return 'other';
  if (LORA_INPUT.test(inputName)) return 'lora';
  return OTHER_INPUT.test(inputName) ? 'other' : 'model';
}

export function groupModels(uses: readonly ModelUse[], names: ModelKindNames): ModelGroups {
  const found = { model: new Set<string>(), lora: new Set<string>(), other: new Set<string>() };
  for (const use of uses) found[modelKindOf(use.file, use.input, names)].add(use.file);
  return {
    model: [...found.model].sort(),
    lora: [...found.lora].sort(),
    other: [...found.other].sort(),
  };
}

export function extractTaskSummary(
  nodes: ReadonlyMap<string, PromptNode>,
  definitions: NodeDefinitionMap,
): TaskSummary {
  const models = new Map<string, ModelUse>();
  const prompts: TaskPrompt[] = [];
  const roles = classifyRoles(nodes);

  for (const [nodeId, node] of nodes) {
    const definition = definitions.get(node.classType);

    for (const [name, value] of Object.entries(node.inputs)) {
      if (typeof value !== 'string' || value.length === 0) continue;

      if (MODEL_FILE.test(value)) {
        if (!models.has(value)) models.set(value, { file: value, input: name });
        continue;
      }

      const input = definition?.inputs.find((candidate) => candidate.name === name);
      if (input?.config.multiline === true) {
        prompts.push({
          nodeId,
          classType: node.classType,
          inputName: name,
          text: value,
          role: roles.get(nodeId) ?? null,
        });
      }
    }
  }

  const rank = (prompt: TaskPrompt): number =>
    prompt.role === 'positive' ? 0 : prompt.role === 'negative' ? 1 : 2;

  return { models: [...models.values()], prompts: [...prompts].sort((a, b) => rank(a) - rank(b)) };
}

interface TaskSettings {
  readonly nodeId: string;
  readonly classType: string;
  readonly values: readonly { readonly name: string; readonly text: string }[];
}

const SETTING_TEXT_LIMIT = 80;

export function extractSettings(
  nodes: ReadonlyMap<string, PromptNode>,
  definitions: NodeDefinitionMap,
): TaskSettings[] {
  const settings: TaskSettings[] = [];

  for (const [nodeId, node] of nodes) {
    const definition = definitions.get(node.classType);
    const values: { name: string; text: string }[] = [];

    for (const [name, value] of Object.entries(node.inputs)) {
      if (typeof value === 'number' || typeof value === 'boolean') {
        values.push({ name, text: String(value) });
        continue;
      }
      if (typeof value !== 'string' || value.length === 0) continue;
      if (MODEL_FILE.test(value) || value.length > SETTING_TEXT_LIMIT) continue;

      const input = definition?.inputs.find((candidate) => candidate.name === name);
      if (input?.config.multiline === true) continue;

      values.push({ name, text: value });
    }

    if (values.length > 0) settings.push({ nodeId, classType: node.classType, values });
  }

  return settings.sort((a, b) => Number(a.nodeId) - Number(b.nodeId));
}

export const ROLE_LABEL = {
  positive: 'queue.detail.role.positive',
  negative: 'queue.detail.role.negative',
} as const satisfies Record<PromptRole, MessageKey>;

interface NodeDuration {
  readonly nodeId: string;
  readonly durationMs: number | null;
}

export function nodeDurations(timings: readonly NodeTiming[]): NodeDuration[] {
  return timings.map((timing) => ({
    nodeId: timing.nodeId,
    durationMs: timing.endedAt === null ? null : timing.endedAt - timing.startedAt,
  }));
}

export interface TaskNodeRow {
  readonly nodeId: string;
  readonly classType: string | null;
  readonly order: number | null;
  readonly durationMs: number | null;
  readonly values: readonly { readonly name: string; readonly text: string }[];
}

export function mergeNodeRows(
  settings: readonly TaskSettings[],
  durations: readonly NodeDuration[],
): TaskNodeRow[] {
  const byNode = new Map(settings.map((node) => [node.nodeId, node]));
  const rows: TaskNodeRow[] = [];
  const placed = new Map<string, number>();

  for (const duration of durations) {
    const seen = placed.get(duration.nodeId);
    if (seen !== undefined) {
      const previous = rows[seen];
      if (previous && duration.durationMs !== null) {
        rows[seen] = {
          ...previous,
          durationMs: (previous.durationMs ?? 0) + duration.durationMs,
        };
      }
      continue;
    }

    const node = byNode.get(duration.nodeId);
    placed.set(duration.nodeId, rows.length);
    rows.push({
      nodeId: duration.nodeId,
      classType: node?.classType ?? null,
      order: rows.length + 1,
      durationMs: duration.durationMs,
      values: node?.values ?? [],
    });
  }

  for (const node of settings) {
    if (placed.has(node.nodeId)) continue;

    rows.push({
      nodeId: node.nodeId,
      classType: node.classType,
      order: null,
      durationMs: null,
      values: node.values,
    });
  }

  return rows;
}
