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

const GENERATION_PARAM_KEYS: readonly GenerationParamKey[] = [
  'temperature',
  'top_p',
  'max_tokens',
  'presence_penalty',
  'frequency_penalty',
  'seed',
  'stop',
];

export function pickGenerationParams(params: GenerationParams): GenerationParams {
  const picked: { -readonly [K in GenerationParamKey]?: GenerationParams[K] } = {};
  const copy = <K extends GenerationParamKey>(key: K): void => {
    const value = params[key];
    if (value !== undefined) picked[key] = value;
  };
  for (const key of GENERATION_PARAM_KEYS) copy(key);
  return picked;
}

export interface RequestPlan {
  readonly tools?: readonly ToolDefinition[] | undefined;
  readonly drop?: number | undefined;
  readonly web?: WebTools | null | undefined;
}

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
  const { stop, ...rest } = pickGenerationParams(llm.params);
  const stops = stop?.filter((item) => item.length > 0) ?? [];
  const sent: readonly (ToolDefinition | ServerTool)[] =
    web === null ? tools : [...tools, ...web.tools];
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

export interface ToolCallTurn {
  readonly chat: Chat;
  readonly messageId: string;
  readonly receivingId: string;
}

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

export const TOOL_REPLY_RULE =
  'Calling this returns no result to you: it runs separately and the user sees its output. ' +
  'Write your full reply as text in the same response as the call.';

type ToolFunctionSpec = ToolDefinition['function'];

interface FunctionArgument {
  readonly name: string;
  readonly description: string;
  readonly schema: ArgumentSchema;
}

export function toolFunction(
  tool: { readonly name: string; readonly description: string },
  args: readonly FunctionArgument[],
): ToolFunctionSpec {
  const properties: Record<string, ArgumentSchema> = {};
  for (const arg of args) {
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

export function withArgumentGuide(spec: ToolFunctionSpec, guide: string): ToolFunctionSpec {
  const added = guide.trim();
  if (added.length === 0) return spec;
  const base = spec.description.trim();
  return {
    ...spec,
    description: base.length === 0 ? added : `${base}\n\n${added}`,
  };
}

export const SUMMARY_MAX_TOKENS = 2048;

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
