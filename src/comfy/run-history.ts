import { ComfyRequestError, fetchJson, postText, type RequestOptions } from '@/comfy/client';
import { userdataFileUrl, userdataListUrl, userdataWriteUrl } from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { parseOutputFiles, sessionOf } from '@/comfy/schema';
import { outputPath, type SlotNode, type ValueSlot } from '@/graph/run-record';
import { finiteNumber, isRecord, isUnknownArray } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';
import type {
  HistoryRunSource,
  PromptRoleMark,
  PromptSlot,
  RunHistoryEntry,
  RunHistoryFile,
  RunHistoryRead,
  RunHistoryRun,
  RunHistoryWorkflow,
} from '@/port/run-history';

export const RUN_HISTORY_DIR = 'kisara/history';

const RUN_HISTORY_VERSION = 5;

const ROLE_MARKS: readonly unknown[] = ['posi', 'nega', null];

function isRoleMark(value: unknown): value is PromptRoleMark {
  return ROLE_MARKS.includes(value);
}

function slotHead(raw: unknown): ValueSlot | null {
  if (!isUnknownArray(raw)) return null;
  const [nodeId, input] = raw;
  return typeof nodeId === 'string' && typeof input === 'string' ? [nodeId, input] : null;
}

function parsePromptSlot(raw: unknown): PromptSlot | null {
  const head = slotHead(raw);
  const role = isUnknownArray(raw) ? (raw[2] ?? null) : undefined;
  return head === null || !isRoleMark(role) ? null : [...head, role];
}

function parseAll<T>(raw: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!isUnknownArray(raw)) return null;
  const items = raw.map(parse);
  return items.every((item) => item !== null) ? items : null;
}

function parseNames(raw: unknown): string[] | null {
  return parseAll(raw, (item) => (typeof item === 'string' ? item : null));
}

function parseSlotNode(raw: unknown): SlotNode | null {
  if (!isUnknownArray(raw) || typeof raw[0] !== 'string') return null;
  const [name, comment] = raw;
  return typeof comment === 'string' ? [name, comment] : [name];
}

function parseSlotNodes(raw: unknown): Record<string, SlotNode> {
  if (!isRecord(raw)) return {};
  const nodes: Record<string, SlotNode> = {};
  for (const [id, value] of Object.entries(raw)) {
    const node = parseSlotNode(value);
    if (node !== null) setOwn(nodes, id, node);
  }
  return nodes;
}

function parseWorkflowEntry(raw: unknown): RunHistoryWorkflow | null {
  if (!isRecord(raw)) return null;
  const model = parseNames(raw.model);
  const lora = parseNames(raw.lora);
  const other = parseNames(raw.other);
  const seeds = parseAll(raw.seeds, slotHead);
  const prompts = parseAll(raw.prompts, parsePromptSlot);
  if (model === null || lora === null || other === null) return null;
  if (seeds === null || prompts === null) return null;

  return {
    model,
    lora,
    other,
    nodes: parseSlotNodes(raw.nodes),
    seeds,
    prompts,
    ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
  };
}

function parseRun(raw: unknown): RunHistoryRun | null {
  if (!isUnknownArray(raw)) return null;
  const [start, finished, paths, workflow, prompt, seeds] = raw;
  const end = finiteNumber(finished);
  const startedAt = finiteNumber(start);
  if (startedAt === null || !isUnknownArray(paths)) return null;

  return {
    start: startedAt,
    end,
    paths: paths.filter((path) => typeof path === 'string'),
    workflow: typeof workflow === 'string' ? workflow : null,
    prompt: typeof prompt === 'string' ? prompt : null,
    seeds: isUnknownArray(seeds) ? seeds : [],
  };
}

export function parseRunHistoryFile(raw: unknown): RunHistoryFile | null {
  if (!isRecord(raw) || raw.v !== RUN_HISTORY_VERSION) return null;
  if (!isRecord(raw.workflows) || !isRecord(raw.prompts) || !isUnknownArray(raw.runs)) return null;

  const workflows: Record<string, RunHistoryWorkflow> = {};
  for (const [key, value] of Object.entries(raw.workflows)) {
    const entry = parseWorkflowEntry(value);
    if (entry !== null) setOwn(workflows, key, entry);
  }
  const prompts: Record<string, readonly unknown[]> = {};
  for (const [key, value] of Object.entries(raw.prompts)) {
    if (isUnknownArray(value)) setOwn(prompts, key, value);
  }
  const runs = raw.runs.map(parseRun).filter((run) => run !== null);
  const name = typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : undefined;
  return { workflows, prompts, runs, ...(name === undefined ? {} : { name }) };
}

export function serializeRunHistoryFile(file: RunHistoryFile): string {
  const runs = file.runs.map((run) => {
    if (run.workflow === null) return [run.start, run.end, run.paths];
    return [run.start, run.end, run.paths, run.workflow, run.prompt, run.seeds];
  });
  return JSON.stringify({
    v: RUN_HISTORY_VERSION,
    workflows: file.workflows,
    prompts: file.prompts,
    runs,
    ...(file.name === undefined ? {} : { name: file.name }),
  });
}

function timestamps(status: unknown): { first: number | null; last: number | null } {
  if (!isRecord(status) || !isUnknownArray(status.messages)) return { first: null, last: null };
  let first: number | null = null;
  let last: number | null = null;
  for (const message of status.messages) {
    const detail = isUnknownArray(message) ? message[1] : null;
    const stamp = isRecord(detail) ? finiteNumber(detail.timestamp) : null;
    if (stamp === null) continue;
    if (first === null || stamp < first) first = stamp;
    if (last === null || stamp > last) last = stamp;
  }
  return { first, last };
}

function sentWorkflow(prompt: unknown): unknown {
  const extra = isUnknownArray(prompt) ? prompt[3] : null;
  const pnginfo = isRecord(extra) ? extra.extra_pnginfo : null;
  return isRecord(pnginfo) && pnginfo.workflow !== undefined ? pnginfo.workflow : null;
}

export function parseHistoryRuns(raw: unknown): HistoryRunSource[] {
  if (!isRecord(raw)) return [];

  const sources: HistoryRunSource[] = [];
  for (const [promptId, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const outputs = isRecord(value.outputs)
      ? Object.values(value.outputs).flatMap((output) => parseOutputFiles(output))
      : [];
    const paths = outputs.map(outputPath);

    const times = timestamps(value.status);
    sources.push({
      promptId,
      startedAt: times.first,
      finishedAt: times.last,
      paths,
      workflow: sentWorkflow(value.prompt),
      session: isUnknownArray(value.prompt) ? sessionOf(value.prompt[3]) : null,
    });
  }
  return sources;
}

function listEntry(raw: unknown): RunHistoryEntry | null {
  const name = isRecord(raw) ? raw.path : raw;
  if (typeof name !== 'string' || !name.endsWith('.json')) return null;
  return { name, modified: isRecord(raw) ? finiteNumber(raw.modified) : null };
}

export async function listRunHistoryFiles(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<RunHistoryEntry[]> {
  try {
    const raw = await fetchJson(userdataListUrl(baseUrl, RUN_HISTORY_DIR), {
      cache: 'no-store',
      ...options,
    });
    if (!isUnknownArray(raw)) return [];
    return raw.map(listEntry).filter((entry) => entry !== null);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

export async function fetchRunHistoryFile(
  baseUrl: string,
  name: string,
  options: RequestOptions = {},
): Promise<RunHistoryRead> {
  const url = userdataFileUrl(baseUrl, RUN_HISTORY_DIR, name);
  let raw: unknown;
  try {
    raw = await fetchJson(url, { cache: 'no-store', ...options });
  } catch (error) {
    if (isNotFound(error)) return { kind: 'missing' };
    if (error instanceof ComfyRequestError && error.kind === 'parse') return { kind: 'unreadable' };
    throw error;
  }
  const file = parseRunHistoryFile(raw);
  return file === null ? { kind: 'unreadable' } : { kind: 'file', file };
}

export async function saveRunHistoryFile(
  baseUrl: string,
  name: string,
  file: RunHistoryFile,
  options: RequestOptions = {},
): Promise<void> {
  const url = userdataWriteUrl(baseUrl, `${RUN_HISTORY_DIR}/${name}`, true);
  await postText(url, serializeRunHistoryFile(file), options);
}
