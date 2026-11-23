export interface LlmEndpoint {
  readonly baseUrl: string;
}

export interface LlmKeyPort {
  readonly keyedUrls: () => readonly string[];
  readonly subscribe: (listener: () => void) => () => void;
  readonly openEntry: (baseUrl: string) => LlmKeyEntryResult;
  readonly onKeySet: (listener: (baseUrl: string) => void) => () => void;
  readonly reportVerified: (baseUrl: string, outcome: LlmKeyOutcome) => void;
  readonly forgetKey: (baseUrl: string) => void;
}

export type LlmKeyEntryResult = 'opened' | 'unready' | 'blocked';

export type LlmKeyOutcome = 'ok' | 'auth' | 'failed';

type ChatRole = 'system' | 'user' | 'assistant';

export interface ToolCallRequest {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export type ChatContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } };

export type ChatRequestMessage =
  | { readonly role: ChatRole; readonly content: string | readonly ChatContentPart[] }
  | {
      readonly role: 'assistant';
      readonly content: string | null;
      readonly tool_calls: readonly ToolCallRequest[];
    }
  | { readonly role: 'tool'; readonly tool_call_id: string; readonly content: string };

export interface ToolDefinition {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}

export type ServerTool =
  | {
      readonly type: 'openrouter:web_search';
      readonly parameters?: { readonly engine: string; readonly mode?: string };
    }
  | {
      readonly type: 'openrouter:web_fetch';
      readonly parameters: { readonly engine?: string; readonly max_content_tokens: number };
    };

export interface Citation {
  readonly url: string;
  readonly title: string;
}

export interface ToolBilling {
  readonly searches?: number | undefined;
  readonly fetches?: number | undefined;
  readonly toolCalls?: number | undefined;
  readonly cost?: number | undefined;
  readonly inferenceCost?: number | undefined;
}

export interface GenerationParams {
  readonly temperature?: number;
  readonly top_p?: number;
  readonly max_tokens?: number;
  readonly presence_penalty?: number;
  readonly frequency_penalty?: number;
  readonly seed?: number;
  readonly stop?: readonly string[];
}

export type GenerationParamKey = keyof GenerationParams;

export interface ChatCompletionRequest extends GenerationParams {
  readonly model: string;
  readonly messages: readonly ChatRequestMessage[];
  readonly tools?: readonly (ToolDefinition | ServerTool)[];
  readonly tool_choice?:
    | 'none'
    | {
        readonly type: 'function';
        readonly function: { readonly name: string };
      };
  readonly max_tool_calls?: number;
  readonly stream: true;
  readonly stream_options: { readonly include_usage: true };
}

export interface TokenUsage {
  readonly prompt: number;
  readonly completion: number;
  readonly cacheRead?: number;
  readonly cacheWrite?: number;
}

export type ChatStreamEvent =
  | {
      readonly kind: 'delta';
      readonly content: string;
      readonly reasoning: string;
      readonly whole?: true;
    }
  | {
      readonly kind: 'tool-call';
      readonly index: number;
      readonly id: string;
      readonly name: string;
      readonly arguments: string;
    }
  | { readonly kind: 'finish'; readonly reason: string }
  | { readonly kind: 'usage'; readonly usage: TokenUsage }
  | { readonly kind: 'billing'; readonly billing: ToolBilling }
  | { readonly kind: 'citations'; readonly citations: readonly Citation[] }
  | { readonly kind: 'processing' };

export type LlmFailureKind =
  | 'stopped'
  | 'consent'
  | 'cors'
  | 'unreachable'
  | 'mixed-content'
  | 'auth'
  | 'not-found'
  | 'redirect'
  | 'rejected'
  | 'rate-limit'
  | 'server'
  | 'interrupted'
  | 'bad-response'
  | 'paused'
  | 'too-large'
  | 'timeout'
  | 'response-too-large';

export interface LlmFailure {
  readonly kind: LlmFailureKind;
  readonly status?: number | undefined;
  readonly message?: string | undefined;
  readonly overflow?: ContextOverflow | undefined;
}

export interface ContextOverflow {
  readonly context: number;
  readonly prompt: number | null;
}

export interface ModelPrice {
  readonly name: string;
  readonly usd: number;
  readonly perToken: boolean;
}

export interface ModelPriceTier {
  readonly conditions: readonly { readonly name: string; readonly value: number }[];
  readonly prices: readonly ModelPrice[];
}

export interface ModelBenchmark {
  readonly source: string;
  readonly label: string;
  readonly values: readonly { readonly name: string; readonly value: number }[];
}

export interface ModelReasoning {
  readonly mandatory: boolean;
  readonly defaultEnabled: boolean | null;
  readonly efforts: readonly string[];
  readonly defaultEffort: string | null;
}

export interface ModelDetails {
  readonly description: string | null;
  readonly created: number | null;
  readonly prices: readonly ModelPrice[];
  readonly priceTiers: readonly ModelPriceTier[];
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly benchmarks: readonly ModelBenchmark[];
  readonly reasoning: ModelReasoning | null;
  readonly reasoningParam: boolean;
  readonly others: readonly { readonly name: string; readonly value: string }[];
}

export interface ModelList {
  readonly ids: readonly string[];
  readonly contexts: Readonly<Record<string, number>>;
  readonly details: Readonly<Record<string, ModelDetails>>;
  readonly serverContext: number | null;
  readonly truncated: boolean;
}

export type LlmResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: LlmFailure };

export interface LlmPort {
  readonly listModels: (
    endpoint: LlmEndpoint,
    signal?: AbortSignal,
  ) => Promise<LlmResult<ModelList>>;
  readonly checkKey: (endpoint: LlmEndpoint, signal?: AbortSignal) => Promise<LlmResult<null>>;
  readonly streamChat: (
    endpoint: LlmEndpoint,
    request: ChatCompletionRequest,
    receiver: ChatStreamReceiver,
  ) => Promise<LlmResult<null>>;
}

export interface ChatStreamReceiver {
  readonly onEvent: (event: ChatStreamEvent) => void;
  readonly signal: AbortSignal;
  readonly onRaw?: ((text: string) => void) | undefined;
}
