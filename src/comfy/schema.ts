import type { ModelFile } from '@/graph/model-files';
import { reportFault } from '@/lib/fault';
import { finiteNumber, isRecord, isUnknownArray, stringOr } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';
import type { ComfyFaultPlace } from '@/port/connection';
import type { OutputFileRef, UploadedImage } from '@/port/files';
import type {
  HistoryDetail,
  HistoryEntry,
  HistoryFailureLine,
  QueueEntry,
  QueueSnapshot,
} from '@/port/history';
import type {
  PromptAccepted,
  PromptNode,
  PromptNodeError,
  RunFailure,
  RunFailureInput,
} from '@/port/run';
import type { SystemStats } from '@/port/system-stats';

const MS_PER_SECOND = 1000;

export function parseOutputFiles(output: unknown): OutputFileRef[] {
  if (!isRecord(output)) return [];

  const files: OutputFileRef[] = [];
  for (const value of Object.values(output)) {
    if (!isUnknownArray(value)) continue;

    for (const item of value) {
      if (!isRecord(item)) continue;

      const filename = stringOr(item.filename, null);
      if (filename === null) continue;

      files.push({
        filename,
        subfolder: stringOr(item.subfolder),
        type: stringOr(item.type, 'output'),
      });
    }
  }
  return files;
}

export function parsePromptErrors(raw: unknown): PromptNodeError[] {
  if (!isRecord(raw) || !isRecord(raw.node_errors)) return [];

  const errors: PromptNodeError[] = [];
  for (const [nodeId, entry] of Object.entries(raw.node_errors)) {
    if (!isRecord(entry)) continue;

    const messages = (isUnknownArray(entry.errors) ? entry.errors : []).flatMap((item) => {
      if (!isRecord(item)) return [];
      const message = stringOr(item.message, null);
      const details = stringOr(item.details, null);
      if (message === null) return [];
      return [details === null || details.length === 0 ? message : `${message}: ${details}`];
    });

    errors.push({ nodeId, classType: stringOr(entry.class_type), messages });
  }
  return errors;
}

export function parsePromptResponse(raw: unknown): PromptAccepted | null {
  if (!isRecord(raw)) return null;

  const promptId = stringOr(raw.prompt_id, null);
  if (promptId === null) return null;

  return { promptId, number: finiteNumber(raw.number) };
}

export function sessionOf(extra: unknown): string | null {
  const own = isRecord(extra) ? extra.kisara : null;
  return isRecord(own) ? stringOr(own.session, null) : null;
}

function parseQueueList(value: unknown): QueueEntry[] {
  if (!isUnknownArray(value)) return [];

  const entries: QueueEntry[] = [];
  for (const item of value) {
    if (!isUnknownArray(item)) continue;

    const promptId = stringOr(item[1], null);
    if (promptId === null) continue;

    const extra = item[3];
    entries.push({
      promptId,
      number: finiteNumber(item[0]),
      createdAt: isRecord(extra) ? finiteNumber(extra.create_time) : null,
      session: sessionOf(extra),
    });
  }
  return entries;
}

export function parseQueue(raw: unknown): QueueSnapshot {
  if (!isRecord(raw)) return { running: [], pending: [] };

  return {
    running: parseQueueList(raw.queue_running),
    pending: parseQueueList(raw.queue_pending),
  };
}

function parseTimestamps(value: unknown): { start: number | null; end: number | null } {
  if (!isUnknownArray(value)) return { start: null, end: null };

  const stamps: number[] = [];
  for (const message of value) {
    if (!isUnknownArray(message)) continue;

    const detail = message[1];
    const timestamp = isRecord(detail) ? finiteNumber(detail.timestamp) : null;
    if (timestamp !== null) stamps.push(timestamp);
  }
  if (stamps.length === 0) return { start: null, end: null };

  return { start: Math.min(...stamps), end: Math.max(...stamps) };
}

export function parseHistory(raw: unknown): HistoryEntry[] {
  if (!isRecord(raw)) return [];

  const entries: HistoryEntry[] = [];
  for (const [promptId, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    try {
      const status = isRecord(value.status) ? value.status : null;
      const statusText = status ? stringOr(status.status_str, null) : null;
      const times = parseTimestamps(status?.messages);

      const outputs = isRecord(value.outputs)
        ? Object.values(value.outputs).flatMap((output) => parseOutputFiles(output))
        : [];

      const queued = isUnknownArray(value.prompt) ? finiteNumber(value.prompt[0]) : null;

      entries.push({
        promptId,
        number: queued,
        outputs,
        success: statusText === null ? null : statusText === 'success',
        startedAt: times.start,
        finishedAt: times.end,
        error: failureLine(parseRunFailure(value)),
        session: isUnknownArray(value.prompt) ? sessionOf(value.prompt[3]) : null,
      });
    } catch (error) {
      const place: ComfyFaultPlace = { code: 'history', params: { id: promptId } };
      reportFault(place, error);
    }
  }

  return entries.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
}

function toStringList(value: unknown): string[] {
  if (!isUnknownArray(value)) return [];
  return value.flatMap(stringItemOf);
}

function stringItemOf(item: unknown): string[] {
  if (typeof item === 'string') return [item];
  if (typeof item === 'number') return [String(item)];
  return [];
}

function formatComfyValue(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function parseFailureInputs(value: unknown): RunFailureInput[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([name, values]) => ({
    name,
    values: isUnknownArray(values) ? values.map(formatComfyValue) : [formatComfyValue(values)],
  }));
}

export function parseRunFailure(entry: unknown): RunFailure | null {
  const status = isRecord(entry) && isRecord(entry.status) ? entry.status : null;
  if (status === null || !isUnknownArray(status.messages)) return null;

  let failure: RunFailure | null = null;
  const cached: string[] = [];
  for (const message of status.messages) {
    if (!isUnknownArray(message) || !isRecord(message[1])) continue;
    const [type, data] = [message[0], message[1]];

    if (type === 'execution_cached') cached.push(...toStringList(data.nodes));
    if (type === 'execution_error' || type === 'execution_interrupted') {
      failure = failureOf(type, data);
    }
  }
  return failure === null ? null : { ...failure, cached };
}

function failureOf(
  type: 'execution_error' | 'execution_interrupted',
  data: Record<string, unknown>,
): RunFailure {
  return {
    kind: type === 'execution_error' ? 'error' : 'interrupted',
    nodeId: stringOr(data.node_id, null) ?? finiteNumber(data.node_id)?.toString() ?? null,
    nodeType: stringOr(data.node_type, null),
    exceptionType: stringOr(data.exception_type, null),
    message: stringOr(data.exception_message, null),
    traceback: toStringList(data.traceback),
    inputs: parseFailureInputs(data.current_inputs),
    executed: toStringList(data.executed),
    cached: [],
  };
}

function failureLine(failure: RunFailure | null): HistoryFailureLine | null {
  if (failure === null) return null;
  if (failure.kind === 'interrupted') return { kind: 'interrupted', line: null };
  const first = failure.message?.split('\n').find((line) => line.trim().length > 0);
  return { kind: 'error', line: first?.trim() ?? failure.exceptionType };
}

export function historyEntryNodes(entry: unknown): Readonly<Record<string, unknown>> | null {
  const prompt = isRecord(entry) && isUnknownArray(entry.prompt) ? entry.prompt[2] : null;

  return isRecord(prompt) ? prompt : null;
}

export function parseHistoryDetail(raw: unknown, promptId: string): HistoryDetail | null {
  const entry = parseHistory(raw).find((candidate) => candidate.promptId === promptId);
  if (!entry) return null;

  const value = isRecord(raw) ? raw[promptId] : null;

  const nodeOutputs: Record<string, OutputFileRef[]> = {};
  if (isRecord(value) && isRecord(value.outputs)) {
    for (const [nodeId, output] of Object.entries(value.outputs)) {
      setOwn(nodeOutputs, nodeId, parseOutputFiles(output));
    }
  }

  return { ...entry, nodes: historyEntryNodes(value) ?? {}, nodeOutputs, entry: value };
}

export function parsePromptNodes(
  nodes: Readonly<Record<string, unknown>>,
): Map<string, PromptNode> {
  const result = new Map<string, PromptNode>();

  for (const [id, value] of Object.entries(nodes)) {
    if (!isRecord(value)) continue;

    const classType = stringOr(value.class_type, null);
    if (classType === null) continue;

    result.set(id, { classType, inputs: isRecord(value.inputs) ? value.inputs : {} });
  }
  return result;
}

export function parseUploadedImage(raw: unknown): UploadedImage | null {
  if (!isRecord(raw)) return null;

  const name = stringOr(raw.name, null);
  if (name === null || name.length === 0) return null;
  return { name, subfolder: stringOr(raw.subfolder), type: stringOr(raw.type, 'input') };
}

export function parseModelFiles(raw: unknown): ModelFile[] {
  if (!isUnknownArray(raw)) return [];

  const files: ModelFile[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;

    const name = stringOr(item.name, null);
    if (name === null || name.length === 0) continue;

    const seconds = (value: unknown): number | null => {
      const number = finiteNumber(value);
      return number === null ? null : Math.round(number * MS_PER_SECOND);
    };

    files.push({
      name,
      pathIndex: finiteNumber(item.pathIndex) ?? 0,
      modified: seconds(item.modified),
      created: seconds(item.created),
      size: finiteNumber(item.size),
    });
  }
  return files;
}

export function parseModelMetadata(raw: unknown): Map<string, string> {
  const entries = new Map<string, string>();
  if (!isRecord(raw)) return entries;

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') entries.set(key, value);
    else if (typeof value === 'number' || typeof value === 'boolean') {
      entries.set(key, String(value));
    }
  }
  return entries;
}

export function parseWildcardList(raw: unknown): string[] | null {
  if (!isRecord(raw) || !isUnknownArray(raw.data)) return null;
  return raw.data.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function parseWildcardExpansion(raw: unknown): string | null {
  return isRecord(raw) && typeof raw.text === 'string' ? raw.text : null;
}

const SYSTEM_TEXT_MAX = 200;
const SYSTEM_DEVICES_MAX = 16;

function systemText(value: unknown): string | null {
  const text = stringOr(value, null);
  return text === null || text.length === 0 ? null : text.slice(0, SYSTEM_TEXT_MAX);
}

export function parseSystemStats(raw: unknown): SystemStats | null {
  if (!isRecord(raw) || !isRecord(raw.system)) return null;
  const { system } = raw;
  const devices = isUnknownArray(raw.devices) ? raw.devices : [];
  return {
    comfyuiVersion: systemText(system.comfyui_version),
    pythonVersion: systemText(system.python_version),
    pytorchVersion: systemText(system.pytorch_version),
    os: systemText(system.os),
    devices: devices
      .filter(isRecord)
      .slice(0, SYSTEM_DEVICES_MAX)
      .map((device) => ({
        type: systemText(device.type),
        name: systemText(device.name),
        vramTotal: finiteNumber(device.vram_total),
      })),
  };
}
