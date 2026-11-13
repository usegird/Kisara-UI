import { assembleParts, mergeParts } from '@/chat/assemble';
import { selectedCandidate } from '@/chat/edit';
import { type PromptSources } from '@/chat/macros';
import { type ArgumentSchema } from '@/chat/tool-arguments';
import { writesReply } from '@/chat/tool-calls';
import type { Chat, ChatMessage } from '@/chat/types';
import type { WebTools } from '@/chat/web-tools';
import { setOwn } from '@/lib/own-key';
import type {
  ChatCompletionRequest,
  ChatRequestMessage,
  GenerationParamKey,
  GenerationParams,
  ServerTool,
  ToolDefinition,
} from '@/port/llm-port';

// ─────────────────────────────
// 会話 → Chat Completions の送る中身の、唯一の組み立て口。送る時点の会話から毎回組み立て、
// 状態として持たない。
// ─────────────────────────────

/** 送ってよい生成の項目（Chat Completions の仕様にあるものだけ） */
const GENERATION_PARAM_KEYS: readonly GenerationParamKey[] = [
  'temperature',
  'top_p',
  'max_tokens',
  'presence_penalty',
  'frequency_penalty',
  'seed',
  'stop',
];

/** 決めた項目だけを写す。仕様に無い項目は落とす */
export function pickGenerationParams(params: GenerationParams): GenerationParams {
  const picked: { -readonly [K in GenerationParamKey]?: GenerationParams[K] } = {};
  const copy = <K extends GenerationParamKey>(key: K): void => {
    const value = params[key];
    if (value !== undefined) picked[key] = value;
  };
  for (const key of GENERATION_PARAM_KEYS) copy(key);
  return picked;
}

/** 会話の組み立ての外で決める、送る中身の決め */
export interface RequestPlan {
  /** 呼べるワークフロー */
  readonly tools?: readonly ToolDefinition[] | undefined;
  /** 上限に収めるため外す履歴の件数 */
  readonly drop?: number | undefined;
  /** OpenRouter の Web 検索・取得 */
  readonly web?: WebTools | null | undefined;
}

/**
 * 受け取る `assistant`（最後のメッセージ）の手前までを、会話の構成で組み立てて送る。
 * 上限に収めるため外す履歴の件数は `drop`。空の本文（止めた・失敗した空の候補）は送らない。
 * 思考の本文は入れない。呼べるワークフローがあれば `tools` に入れる。`web` があれば
 * OpenRouter の Web 検索・取得を足し、その手数を上限にする
 */
export function buildChatRequest(
  chat: Chat,
  llm: { readonly model: string; readonly params: GenerationParams },
  sources?: PromptSources,
  { tools = [], drop = 0, web = null }: RequestPlan = {},
): ChatCompletionRequest {
  const messages = mergeParts(
    assembleParts(chat, chat.prompt, sources, drop),
    sources?.squashSystem === true,
  );
  // 停止の文字列は空の行を落とし、1 つも無ければ送らない
  const { stop, ...rest } = pickGenerationParams(llm.params);
  const stops = stop?.filter((item) => item.length > 0) ?? [];
  const sent: readonly (ToolDefinition | ServerTool)[] =
    web === null ? tools : [...tools, ...web.tools];
  // 本文を書かせるときは、ツールは送ったまま呼ばせない（履歴の呼び出しと揃える）
  const last = chat.messages.at(-1);
  const replying = last !== undefined && writesReply(selectedCandidate(last));
  return {
    ...rest,
    ...(stops.length > 0 ? { stop: stops } : {}),
    model: llm.model.trim(),
    messages,
    ...(sent.length > 0 ? { tools: sent } : {}),
    ...(sent.length > 0 && replying ? { tool_choice: 'none' as const } : {}),
    ...(web === null ? {} : { max_tool_calls: web.calls }),
    stream: true,
    stream_options: { include_usage: true },
  };
}

/** 呼び出しを作らせる会話の場所 */
export interface ToolCallTurn {
  readonly chat: Chat;
  /** ここまでの発言を送る */
  readonly messageId: string;
  /** 受け取る `assistant` の id */
  readonly receivingId: string;
}

/**
 * 選んだワークフローの呼び出しを作らせる送る中身（「ワークフローを実行」）。
 * 会話を `messageId` の発言（呼び出しと結果を含む）までにして会話と同じ構成で組み立て、`tools` は
 * 選んだ 1 件だけにして `tool_choice` でそれを呼ばせる。Web のツールは付けない
 */
export function buildToolCallRequest(
  { chat, messageId, receivingId }: ToolCallTurn,
  llm: { readonly model: string; readonly params: GenerationParams },
  sources: PromptSources | undefined,
  tool: ToolDefinition,
): ChatCompletionRequest {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  const receiving: ChatMessage = {
    id: receivingId,
    role: 'assistant',
    candidates: [{ content: '', reasoning: '', end: { kind: 'streaming' } }],
    selected: 0,
  };
  const upTo = { ...chat, messages: [...chat.messages.slice(0, index + 1), receiving] };
  return {
    ...buildChatRequest(upTo, llm, sources, { tools: [tool] }),
    tool_choice: { type: 'function', function: { name: tool.function.name } },
  };
}

// ─────────────────────────────
// ワークフローの関数の定義（`tools[].function`）
// ─────────────────────────────

/**
 * どのワークフローのツールの説明にも最後に添える決まった一文。呼び出しは結果を返さずに
 * 別に動くので、本文も同じ応答で書かせる（呼び出しだけを返すと応答に文字が付かない）
 */
export const TOOL_REPLY_RULE =
  'Calling this returns no result to you: it runs separately and the user sees its output. ' +
  'Write your full reply as text in the same response as the call.';

/** LLM に送る関数の中身（Chat Completions の `tools[].function`） */
type ToolFunctionSpec = ToolDefinition['function'];

/** 関数の引数にする 1 つ（ワークフローの送る引数のうち、定義に要る所） */
interface FunctionArgument {
  readonly name: string;
  readonly description: string;
  readonly schema: ArgumentSchema;
}

/** ツールの名前と説明、送る引数から、LLM に送る関数の中身を組み立てる */
export function toolFunction(
  tool: { readonly name: string; readonly description: string },
  args: readonly FunctionArgument[],
): ToolFunctionSpec {
  const properties: Record<string, ArgumentSchema> = {};
  for (const arg of args) {
    // 引数の名前はワークフローの JSON から来る（`__proto__` でも親を差し替えない）
    const schema =
      arg.description.trim().length > 0
        ? { ...arg.schema, description: arg.description }
        : arg.schema;
    setOwn(properties, arg.name, schema);
  }
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties,
      required: args.map((arg) => arg.name),
      additionalProperties: false,
    },
  };
}

/**
 * 説明の後ろに共通の追加指示を空行を挟んで添える。指示が空なら元のまま、説明が空なら指示だけ
 */
export function withArgumentGuide(spec: ToolFunctionSpec, guide: string): ToolFunctionSpec {
  const added = guide.trim();
  if (added.length === 0) return spec;
  const base = spec.description.trim();
  return {
    ...spec,
    description: base.length === 0 ? added : `${base}\n\n${added}`,
  };
}

/**
 * 要約の長さの上限（トークン）。会話の max_tokens は返答の長さなので使わない
 */
export const SUMMARY_MAX_TOKENS = 2048;

/**
 * 会話履歴の要約を作らせる送る中身。生成の設定は会話と同じで、`max_tokens` は要約用の
 * 上限にする。停止の文字列・`tools`・プレフィルは付けない
 */
export function buildSummaryRequest(
  messages: readonly ChatRequestMessage[],
  llm: { readonly model: string; readonly params: GenerationParams },
): ChatCompletionRequest {
  const { stop, ...rest } = pickGenerationParams(llm.params);
  void stop;
  return {
    ...rest,
    max_tokens: SUMMARY_MAX_TOKENS,
    model: llm.model.trim(),
    messages: [...messages],
    stream: true,
    stream_options: { include_usage: true },
  };
}

/**
 * 構成の相談の送る中身。生成の設定は会話と同じ。停止の文字列・ワークフローの `tools`・
 * プレフィルは付けない。案を書かせるツール（`proposal`）を付け、Web 検索を有効にしていれば、会話と
 * 同じく Web のツールと手数の上限も付ける。`tool_choice` は付けない（本文だけで答える相談もある）
 */
export function buildAdvisorRequest(
  messages: readonly ChatRequestMessage[],
  llm: { readonly model: string; readonly params: GenerationParams },
  web: WebTools | null = null,
  proposal: ToolDefinition | null = null,
): ChatCompletionRequest {
  const { stop, ...rest } = pickGenerationParams(llm.params);
  void stop;
  const tools: readonly (ToolDefinition | ServerTool)[] = [
    ...(proposal === null ? [] : [proposal]),
    ...(web?.tools ?? []),
  ];
  return {
    ...rest,
    model: llm.model.trim(),
    messages: [...messages],
    stream: true,
    stream_options: { include_usage: true },
    ...(tools.length > 0 ? { tools } : {}),
    ...(web === null ? {} : { max_tool_calls: web.calls }),
  };
}
