import type {
  Candidate,
  CandidateEnd,
  CandidateRevision,
  ChatSummary,
  ResponseRecord,
  ResponseTiming,
  ToolCallGeneration,
  ToolCallProblem,
  ToolCallRecord,
  ToolCallRun,
  ToolCallState,
} from '@/chat/types';
import { finiteNumber, isRecord, isUnknownArray, stringOr } from '@/lib/guards';
import type {
  Citation,
  ContextOverflow,
  LlmFailureKind,
  TokenUsage,
  ToolBilling,
} from '@/port/llm-port';

// ─────────────────────────────
// 候補とその記録（終わり方・呼び出し・使用量・費用・引用）と要約の読み戻し。
// ─────────────────────────────

const FAILURE_KINDS: readonly LlmFailureKind[] = [
  'stopped',
  'consent',
  'cors',
  'unreachable',
  'mixed-content',
  'auth',
  'not-found',
  'rejected',
  'rate-limit',
  'server',
  'interrupted',
  'bad-response',
  'paused',
  'too-large',
  'timeout',
  'response-too-large',
];

function parseOverflow(raw: unknown): { overflow: ContextOverflow } | Record<string, never> {
  if (!isRecord(raw)) return {};
  const context = finiteNumber(raw.context);
  if (context === null || context <= 0) return {};
  return { overflow: { context, prompt: finiteNumber(raw.prompt) } };
}

/** 候補の終わり方を読む。読めない形は終わったもの（理由なし）とし、失敗の種類が分からなければ応答の不正にする */
function parseEnd(raw: unknown): CandidateEnd {
  if (!isRecord(raw)) return { kind: 'done', reason: null };
  if (raw.kind === 'streaming') return { kind: 'streaming' };
  if (raw.kind === 'stopped') return { kind: 'stopped' };
  const failure = raw.failure;
  if (raw.kind === 'failed' && isRecord(failure)) {
    const kind = FAILURE_KINDS.find((item) => item === failure.kind);
    const status = finiteNumber(failure.status);
    const message = typeof failure.message === 'string' ? failure.message : undefined;
    return {
      kind: 'failed',
      failure: {
        kind: kind ?? 'bad-response',
        ...(status === null ? {} : { status }),
        message,
        ...parseOverflow(failure.overflow),
      },
    };
  }
  return { kind: 'done', reason: typeof raw.reason === 'string' ? raw.reason : null };
}

const ARGUMENT_PROBLEMS = ['missing', 'unknown', 'type', 'range', 'choice'] as const;

function parseProblem(raw: unknown): ToolCallProblem {
  if (!isRecord(raw)) return { code: 'unknown-tool' };
  if (raw.code === 'json') return { code: 'json' };
  const code = ARGUMENT_PROBLEMS.find((item) => item === raw.code);
  return code === undefined ? { code: 'unknown-tool' } : { code, argument: stringOr(raw.argument) };
}

function parseFileRef(raw: unknown): { filename: string; subfolder: string; type: string }[] {
  if (!isRecord(raw) || typeof raw.filename !== 'string') return [];
  return [{ filename: raw.filename, subfolder: stringOr(raw.subfolder), type: stringOr(raw.type) }];
}

/** 呼び出しの状態。読めない形は失敗として残す（呼び出しそのものは消さない） */
function parseCallState(raw: unknown): ToolCallState {
  if (!isRecord(raw)) return { kind: 'failed', message: '' };
  switch (raw.kind) {
    case 'receiving':
    case 'waiting':
    case 'declined':
      return { kind: raw.kind };
    case 'invalid':
      return { kind: 'invalid', problem: parseProblem(raw.problem) };
    case 'queued':
    case 'unknown':
      if (typeof raw.promptId !== 'string') return { kind: 'failed', message: '' };
      return {
        kind: raw.kind,
        promptId: raw.promptId,
        ...(isUnknownArray(raw.outputs) && raw.outputs.length > 0
          ? { outputs: raw.outputs.filter((item) => typeof item === 'string') }
          : {}),
      };
    case 'done':
      return {
        kind: 'done',
        images: isUnknownArray(raw.images) ? raw.images.flatMap(parseFileRef) : [],
      };
    default:
      return { kind: 'failed', message: stringOr(raw.message) };
  }
}

function parseRun(raw: unknown): ToolCallRun[] {
  if (!isRecord(raw)) return [];
  return [{ arguments: stringOr(raw.arguments), state: parseCallState(raw.state) }];
}

function parseToolCall(raw: unknown): ToolCallRecord[] {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return [];
  const previousRuns = isUnknownArray(raw.previousRuns) ? raw.previousRuns.flatMap(parseRun) : [];
  const generation = parseGeneration(raw.generation);
  return [
    {
      id: raw.id,
      name: raw.name,
      arguments: stringOr(raw.arguments),
      state: parseCallState(raw.state),
      ...(previousRuns.length === 0 ? {} : { previousRuns }),
      ...(generation === null ? {} : { generation }),
    },
  ];
}

function parseUsage(raw: unknown): TokenUsage | null {
  if (!isRecord(raw)) return null;
  const prompt = finiteNumber(raw.prompt);
  const completion = finiteNumber(raw.completion);
  if (prompt === null || completion === null) return null;
  const cacheRead = finiteNumber(raw.cacheRead);
  const cacheWrite = finiteNumber(raw.cacheWrite);
  return {
    prompt,
    completion,
    ...(cacheRead === null ? {} : { cacheRead }),
    ...(cacheWrite === null ? {} : { cacheWrite }),
  };
}

/** 応答の記録。物でなければ null */
function parseResponseRecord(raw: unknown): ResponseRecord | null {
  if (!isRecord(raw)) return null;
  const usage = parseUsage(raw.usage);
  const timing = parseTiming(raw.timing);
  const billing = parseBilling(raw.billing);
  return {
    ...(usage === null ? {} : { usage }),
    ...(timing === null ? {} : { timing }),
    ...(billing === null ? {} : { billing }),
  };
}

/** 呼び出しを作らせた応答の記録。物でなければ null */
function parseGeneration(raw: unknown): ToolCallGeneration | null {
  const record = parseResponseRecord(raw);
  return record === null || !isRecord(raw)
    ? null
    : { reasoning: stringOr(raw.reasoning), ...record };
}

/**
 * 使用状況。数でない項目は落とし、1 つも無ければ null
 */
function parseBilling(raw: unknown): ToolBilling | null {
  if (!isRecord(raw)) return null;
  const searches = finiteNumber(raw.searches);
  const fetches = finiteNumber(raw.fetches);
  const toolCalls = finiteNumber(raw.toolCalls);
  const cost = finiteNumber(raw.cost);
  const inferenceCost = finiteNumber(raw.inferenceCost);
  if (searches === null && fetches === null && toolCalls === null && cost === null) return null;
  return {
    ...(searches === null ? {} : { searches }),
    ...(fetches === null ? {} : { fetches }),
    ...(toolCalls === null ? {} : { toolCalls }),
    ...(cost === null ? {} : { cost }),
    ...(inferenceCost === null ? {} : { inferenceCost }),
  };
}

/** 受け取りの記録。数でない項目は落とし、1 つも無ければ null */
function parseTiming(raw: unknown): ResponseTiming | null {
  if (!isRecord(raw)) return null;
  const firstMs = finiteNumber(raw.firstMs);
  const receivingMs = finiteNumber(raw.receivingMs);
  const referenceUsd = finiteNumber(raw.referenceUsd);
  if (firstMs === null && receivingMs === null && referenceUsd === null) return null;
  return {
    ...(firstMs === null ? {} : { firstMs }),
    ...(receivingMs === null ? {} : { receivingMs }),
    ...(referenceUsd === null ? {} : { referenceUsd }),
  };
}

function parseCitation(raw: unknown): Citation[] {
  if (!isRecord(raw) || typeof raw.url !== 'string' || raw.url.length === 0) return [];
  return [{ url: raw.url, title: stringOr(raw.title) }];
}

/** 候補を 1 つ読む。物でなければ null。読めない項目は落とす */
export function parseCandidate(raw: unknown): Candidate | null {
  if (!isRecord(raw)) return null;
  const usage = parseUsage(raw.usage);
  const toolCalls = isUnknownArray(raw.toolCalls) ? raw.toolCalls.flatMap(parseToolCall) : [];
  const sentEstimate = finiteNumber(raw.sentEstimate);
  const trimmed = finiteNumber(raw.trimmed);
  const images = isUnknownArray(raw.images) ? raw.images.filter(isImageDataUrl) : [];
  const billing = parseBilling(raw.billing);
  const timing = parseTiming(raw.timing);
  const citations = isUnknownArray(raw.citations) ? raw.citations.flatMap(parseCitation) : [];
  return {
    content: stringOr(raw.content),
    reasoning: stringOr(raw.reasoning),
    end: parseEnd(raw.end),
    ...(usage === null ? {} : { usage }),
    ...(toolCalls.length === 0 ? {} : { toolCalls }),
    ...(timing === null ? {} : { timing }),
    ...(billing === null ? {} : { billing }),
    ...(citations.length === 0 ? {} : { citations }),
    ...(sentEstimate === null || sentEstimate <= 0 ? {} : { sentEstimate }),
    ...(trimmed === null || trimmed <= 0 ? {} : { trimmed: Math.trunc(trimmed) }),
    ...(images.length === 0 ? {} : { images }),
    ...parseRevision(raw.revision),
  };
}

/**
 * 指示で作り直した候補の土台と指示。読めなければ持たない
 */
function parseRevision(raw: unknown): { revision: CandidateRevision } | Record<string, never> {
  if (!isRecord(raw) || typeof raw.instruction !== 'string') return {};
  const base = finiteNumber(raw.base);
  if (base === null || base < 0 || raw.instruction.trim().length === 0) return {};
  return { revision: { base: Math.trunc(base), instruction: raw.instruction } };
}

/**
 * 添えた画像として読めるもの（画像のデータ URL だけ）
 */
function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

/**
 * 会話履歴の要約を読む。読めなければ持たない
 */
export function parseSummary(raw: unknown): { summary: ChatSummary } | Record<string, never> {
  if (!isRecord(raw) || typeof raw.content !== 'string' || typeof raw.upTo !== 'string') return {};
  const response = parseResponseRecord(raw.response);
  return {
    summary: {
      content: raw.content,
      upTo: raw.upTo,
      ...(response === null ? {} : { response }),
    },
  };
}
