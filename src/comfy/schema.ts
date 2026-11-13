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

// ─────────────────────────────
// 外部レスポンス（HTTP）の検証。WebSocket の通知は schema-event.ts。`unknown` で受けて必要な形だけ確認し、`as` で型に押し込まない。
// ─────────────────────────────

const MS_PER_SECOND = 1000;

/**
 * ノードの出力から画像・動画などのファイル参照を取り出す。
 * ComfyUI は `{images: [...]}` `{gifs: [...]}` のように**種類ごとの配列**で返すので、
 * キー名を決め打ちせず「filename を持つ配列」をすべて拾う。
 */
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

/**
 * `POST /prompt` が 400 で返す検証エラーを、ノードごとの文面の並びにする。
 * `node_errors` は ノードid → `{errors: [{type, message, details}], class_type}`。
 */
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

/** `POST /prompt` の応答。node_errors があれば受理されていない */
export function parsePromptResponse(raw: unknown): PromptAccepted | null {
  if (!isRecord(raw)) return null;

  const promptId = stringOr(raw.prompt_id, null);
  if (promptId === null) return null;

  return { promptId, number: finiteNumber(raw.number) };
}

// ─────────────────────────────
// キューと履歴（`GET /queue` / `GET /history`）。
//
// **証拠グレード**: 形は ComfyUI 本体のソース（`execution.py` の `PromptQueue`）読解。
// 実機の応答は未検証なので、想定外の形は落として通す（欠けても画面が壊れないようにする）。
//   /queue   : { queue_running: [[番号, prompt_id, prompt, extra_data, outputs], ...],
//                queue_pending: [同じ形] }
//   /history : { <prompt_id>: { prompt: [番号, prompt_id, prompt, extra_data, outputs],
//                               outputs: { <nodeId>: {...} }, meta: {...},
//                               status: { status_str, completed,
//                                         messages: [[種別, { timestamp, ... }], ...] } } }
//
// **ノード単位の時刻は履歴に無い**（種別は execution_start /
// execution_cached / execution_success の3つだけ）。ノードごとの所要時間は、
// この画面が WebSocket で見ていた実行についてのみ分かる。
//
// 失敗した実行は execution_success の代わりに execution_error（中断なら
// execution_interrupted）が残る。中身は通知と同じ（本体 `execution.py` の
// `handle_execution_error` 読解。実機の失敗の応答は未検証）:
//   { node_id, node_type, executed: [id...], exception_message, exception_type,
//     traceback: [文字列...], current_inputs: { 名前: [値...] }, current_outputs }
// `executed` は**実際に動いたノードだけ**（キャッシュは含まない）で、**順は無い**（集合）。
// ─────────────────────────────

/**
 * `extra_data` に添えたセッションの id。無ければ null
 */
export function sessionOf(extra: unknown): string | null {
  const own = isRecord(extra) ? extra.kisara : null;
  return isRecord(own) ? stringOr(own.session, null) : null;
}

function parseQueueList(value: unknown): QueueEntry[] {
  if (!isUnknownArray(value)) return [];

  const entries: QueueEntry[] = [];
  for (const item of value) {
    if (!isUnknownArray(item)) continue;

    // 並びは [番号, prompt_id, prompt, extra_data, outputs]。id が取れたものだけ拾う
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

/** `GET /queue` の応答を、走っている実行と待っている実行の並びにする。形が違えば空 */
export function parseQueue(raw: unknown): QueueSnapshot {
  if (!isRecord(raw)) return { running: [], pending: [] };

  return {
    running: parseQueueList(raw.queue_running),
    pending: parseQueueList(raw.queue_pending),
  };
}

/** `messages` から最初と最後の timestamp を拾う（種別名には依存しない） */
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

/** 新しいものが先。応答の並びは保証されないので、時刻が取れたものを優先して並べる */
export function parseHistory(raw: unknown): HistoryEntry[] {
  if (!isRecord(raw)) return [];

  const entries: HistoryEntry[] = [];
  for (const [promptId, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    // **1 件ずつ閉じ込める**。読めない 1 件だけを外す
    try {
      const status = isRecord(value.status) ? value.status : null;
      const statusText = status ? stringOr(status.status_str, null) : null;
      const times = parseTimestamps(status?.messages);

      const outputs = isRecord(value.outputs)
        ? Object.values(value.outputs).flatMap((output) => parseOutputFiles(output))
        : [];

      // `prompt` は [番号, prompt_id, prompt, extra_data, outputs] の並び
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
      // 通信の層は文言の表を読まないので、場所は符号で渡す（帯の文は画面の側が引く）
      const place: ComfyFaultPlace = { code: 'history', params: { id: promptId } };
      reportFault(place, error);
    }
  }

  return entries.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
}

// ─────────────────────────────
// 失敗の記録（履歴の 1 件の `status.messages`）。
// ─────────────────────────────

/** 配列の中の文字列と数を、文字列の並びにする（数も文字にして残す）。配列でなければ空 */
function toStringList(value: unknown): string[] {
  if (!isUnknownArray(value)) return [];
  return value.flatMap(stringItemOf);
}

function stringItemOf(item: unknown): string[] {
  if (typeof item === 'string') return [item];
  if (typeof item === 'number') return [String(item)];
  return [];
}

/** 値を文字にする。ComfyUI 側で文字・数・真偽・null に揃えてある（揃っていなければ JSON） */
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

/**
 * 履歴の 1 件分から失敗の記録を取り出す。成功した・記録が無い・読めないなら null。
 * 種別名で拾う（`execution_error` / `execution_interrupted`）。
 */
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

/** 失敗の通知 1 件の中身を失敗の記録にする（使わなかった結果の一覧は呼び出し側が足す） */
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

/** カードに出す 1 行の元。例外の文面の 1 行目（無ければ種類）。文にするのは画面の側 */
function failureLine(failure: RunFailure | null): HistoryFailureLine | null {
  if (failure === null) return null;
  if (failure.kind === 'interrupted') return { kind: 'interrupted', line: null };
  const first = failure.message?.split('\n').find((line) => line.trim().length > 0);
  return { kind: 'error', line: first?.trim() ?? failure.exceptionType };
}

/** 履歴の1件分から、実行した API Prompt を取り出す（`prompt[2]`） */
export function historyEntryNodes(entry: unknown): Readonly<Record<string, unknown>> | null {
  const prompt = isRecord(entry) && isUnknownArray(entry.prompt) ? entry.prompt[2] : null;

  return isRecord(prompt) ? prompt : null;
}

/** `/history/{id}` の応答を、その 1 件の詳細（実行した API Prompt とノードごとの結果）にする */
export function parseHistoryDetail(raw: unknown, promptId: string): HistoryDetail | null {
  // `/history/{id}` は `{ <prompt_id>: {...} }` の形で返る
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

/** API Prompt のノードを id → `class_type` と入力の表にする。`class_type` の無いものは外す */
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

/** 名前が無ければ null（置けたかどうか分からない）。サブフォルダと置き場は既定に落とす */
export function parseUploadedImage(raw: unknown): UploadedImage | null {
  if (!isRecord(raw)) return null;

  const name = stringOr(raw.name, null);
  if (name === null || name.length === 0) return null;
  return { name, subfolder: stringOr(raw.subfolder), type: stringOr(raw.type, 'input') };
}

/**
 * モデルファイルの一覧（`/experiment/models/{folder}`）。
 * 想定外の形の項目は捨て、読める分だけ返す（1 件で全体を落とさない）。
 * 日時は**秒**で返るのでミリ秒に直す。
 */
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

/**
 * safetensors の `__metadata__`。**値は文字列**（中身が JSON の文字列であることも多い）。
 * 文字列でない値は文字列に直して残す。想定外の形なら空にする。
 */
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

/**
 * ワイルドカードの名前の一覧（Impact Pack の `{data: ["__name__", …]}`）。
 * 形が違えば null（使えない接続先として扱う）。文字でない項目は捨てる
 */
export function parseWildcardList(raw: unknown): string[] | null {
  if (!isRecord(raw) || !isUnknownArray(raw.data)) return null;
  return raw.data.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/** 版の文字の長さの上限（`python_version` はビルドの情報まで付く） */
const SYSTEM_TEXT_MAX = 200;
/** 機器の数の上限 */
const SYSTEM_DEVICES_MAX = 16;

function systemText(value: unknown): string | null {
  const text = stringOr(value, null);
  return text === null || text.length === 0 ? null : text.slice(0, SYSTEM_TEXT_MAX);
}

/**
 * `GET /system_stats` の決めた欄だけを読む。**起動オプション（`argv`）は読まない**
 * （パスやポートが入る）。形が違えば null。`comfyui_version` は古い版には無い（null になる）
 */
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
