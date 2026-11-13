// ─────────────────────────────
// LLM の通信の窓口の型。OpenAI 互換の Chat Completions とモデルの一覧だけを扱う。
// 実装は `llm/` が持ち、入口が受け口に入れる。値を持たない。
// ─────────────────────────────

/**
 * 送り先。ベース URL は `/chat/completions` と `/models` の手前まで。API キーは持たない
 * （ゲートウェイがベース URL ごとに持ち、ゲートウェイの中で付ける）
 */
export interface LlmEndpoint {
  readonly baseUrl: string;
}

/**
 * ゲートウェイの窓口。キーそのものは本体に渡さず、どの接続先にキーがあるかだけを返す
 */
export interface LlmKeyPort {
  /** キーが入っているベース URL（整えた形） */
  readonly keyedUrls: () => readonly string[];
  /** キーが入った・ゲートウェイとつながったときに呼ぶ。返り値で外す */
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * キーの入力の窓を開く。利用者の操作の中から呼ぶ（ポップアップの決まり）。
   * ゲートウェイとまだつながっていなければ開かずに `unready`、ブラウザに止められたら `blocked`
   */
  readonly openEntry: (baseUrl: string) => LlmKeyEntryResult;
  /** 入力の窓からキーが入るたびに呼ぶ（同じキーを入れ直したときも）。返り値で外す */
  readonly onKeySet: (listener: (baseUrl: string) => void) => () => void;
  /** 入ったキーを確かめた結果を、そのキーを入れた窓へ返す */
  readonly reportVerified: (baseUrl: string, outcome: LlmKeyOutcome) => void;
}

/** キーの入力の窓を開いた結果 */
export type LlmKeyEntryResult = 'opened' | 'unready' | 'blocked';

/** 入れたキーを確かめた結果（通った・キーが断られた・届かないなどほかの失敗） */
export type LlmKeyOutcome = 'ok' | 'auth' | 'failed';

/** 本文だけを持つ発言の役割 */
type ChatRole = 'system' | 'user' | 'assistant';

/** `assistant` が返した関数の呼び出し（`tool_calls[]`）。引数は JSON の本文のまま */
export interface ToolCallRequest {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

/**
 * `content` の部品。本文と画像（データ URL か URL）
 */
export type ChatContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } };

/**
 * 送る 1 つの発言。呼び出しを持つ `assistant` と、呼び出しの結果を返す `tool` もある。
 * 画像を持つ発言だけ `content` を部品の配列にする
 */
export type ChatRequestMessage =
  | { readonly role: ChatRole; readonly content: string | readonly ChatContentPart[] }
  | {
      readonly role: 'assistant';
      readonly content: string | null;
      readonly tool_calls: readonly ToolCallRequest[];
    }
  | { readonly role: 'tool'; readonly tool_call_id: string; readonly content: string };

/**
 * 送る関数（`tools[]`）。引数の形は JSON Schema
 */
export interface ToolDefinition {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}

/**
 * OpenRouter のサーバー側の Web 検索・Web 取得。OpenRouter の中で行い、呼び出しはこちらへ
 * 返らない。エンジンを決めなければ OpenRouter の既定になる
 */
export type ServerTool =
  | {
      readonly type: 'openrouter:web_search';
      readonly parameters?: { readonly engine: string; readonly mode?: string };
    }
  | {
      readonly type: 'openrouter:web_fetch';
      readonly parameters: { readonly engine?: string; readonly max_content_tokens: number };
    };

/** 応答が返した出典（`annotations` の `url_citation`） */
export interface Citation {
  readonly url: string;
  /** 無ければ空 */
  readonly title: string;
}

/** 応答が返したサーバー側のツールの使用状況と費用（米ドル。OpenRouter）。返ったものだけ持つ */
export interface ToolBilling {
  readonly searches?: number | undefined;
  readonly fetches?: number | undefined;
  /** 実行したサーバー側のツールの数（検索と取得を合わせた数。`tool_calls_executed`） */
  readonly toolCalls?: number | undefined;
  readonly cost?: number | undefined;
  /** そのうちモデルの推論の費用（`cost_details.upstream_inference_cost`） */
  readonly inferenceCost?: number | undefined;
}

/** 生成の設定。決めていない項目は持たない（送らない） */
export interface GenerationParams {
  readonly temperature?: number;
  readonly top_p?: number;
  readonly max_tokens?: number;
  readonly presence_penalty?: number;
  readonly frequency_penalty?: number;
  readonly seed?: number;
  readonly stop?: readonly string[];
}

/** 生成の設定の項目の名前 */
export type GenerationParamKey = keyof GenerationParams;

/** `POST /chat/completions` の本体 */
export interface ChatCompletionRequest extends GenerationParams {
  readonly model: string;
  readonly messages: readonly ChatRequestMessage[];
  /** 呼べる関数と Web 検索。無ければ送らない */
  readonly tools?: readonly (ToolDefinition | ServerTool)[];
  /**
   * 呼ばせる関数を 1 つに決める（ワークフローを選んで引数を作らせるとき）か、
   * 呼ばせない（`none`。呼び出しの後に本文を書かせるとき）
   */
  readonly tool_choice?:
    | 'none'
    | {
        readonly type: 'function';
        readonly function: { readonly name: string };
      };
  /**
   * サーバー側のツールの手数の上限（OpenRouter。Web 検索・取得を送るときだけ）
   */
  readonly max_tool_calls?: number;
  readonly stream: true;
  /** 使ったトークン数を最後の塊で返させる（返さないサーバーもある） */
  readonly stream_options: { readonly include_usage: true };
}

/** 使ったトークン数（応答にあれば） */
export interface TokenUsage {
  /** 入力の全体（キャッシュの読み・書きの分を含む） */
  readonly prompt: number;
  readonly completion: number;
  /**
   * キャッシュから読んだ入力。返さないサーバーでは無い
   */
  readonly cacheRead?: number;
  /** キャッシュに書いた入力。返さないサーバーでは無い */
  readonly cacheWrite?: number;
}

/** 受け取りの途中で届くもの。本文と思考の本文は届いた分だけ（足していく） */
export type ChatStreamEvent =
  | {
      readonly kind: 'delta';
      readonly content: string;
      readonly reasoning: string;
      /** 1 つの JSON で返った本文の全体（ストリーミングに応じないサーバー） */
      readonly whole?: true;
    }
  /**
   * 関数の呼び出しの断片。`index` で同じ呼び出しを指し、名前と引数の本文は届いた分だけ（足していく）。
   * 1 つの JSON で返ったときは全体が 1 つで届く
   */
  | {
      readonly kind: 'tool-call';
      readonly index: number;
      readonly id: string;
      readonly name: string;
      readonly arguments: string;
    }
  | { readonly kind: 'finish'; readonly reason: string }
  | { readonly kind: 'usage'; readonly usage: TokenUsage }
  /**
   * 応答の `usage` にあった Web 検索・取得の回数と費用。どれも無ければ届かない
   */
  | { readonly kind: 'billing'; readonly billing: ToolBilling }
  /**
   * 届いた出典
   */
  | { readonly kind: 'citations'; readonly citations: readonly Citation[] }
  /**
   * 接続先が処理中の注釈の行を送った（OpenRouter の `: OPENROUTER PROCESSING`）。サーバー側のツールを
   * 動かしている間は、これだけが届く
   */
  | { readonly kind: 'processing' };

/**
 * 失敗の原因。止めた（`stopped`）は失敗ではないが、
 * 受け取りが途中で終わったことを呼び出し側へ同じ形で返す
 */
export type LlmFailureKind =
  | 'stopped'
  | 'consent'
  | 'cors'
  | 'unreachable'
  | 'mixed-content'
  | 'auth'
  | 'not-found'
  | 'rejected'
  | 'rate-limit'
  | 'server'
  | 'interrupted'
  | 'bad-response'
  /**
   * 窓の間の量が閾値を超えたので止めた
   */
  | 'paused'
  /**
   * 1 回の送る中身が上限を超えたので送らなかった
   */
  | 'too-large'
  /**
   * 決めた時間のうちに応答が無かった
   */
  | 'timeout'
  /**
   * 受け取る中身が上限を超えたので読むのをやめた
   */
  | 'response-too-large';

/** LLM の要求の失敗。原因と、分かれば状態番号・断りの文 */
export interface LlmFailure {
  readonly kind: LlmFailureKind;
  /** HTTP の状態番号（応答があったとき） */
  readonly status?: number | undefined;
  /** 応答の `error.message`（あれば） */
  readonly message?: string | undefined;
  /**
   * 文脈の上限を超えて断られたとき、断りから読めた上限と送った数
   */
  readonly overflow?: ContextOverflow | undefined;
}

/** 文脈の上限の断り。上限（文脈長）と、読めれば送ったトークン数 */
export interface ContextOverflow {
  readonly context: number;
  readonly prompt: number | null;
}

/** 費用の 1 項目（`pricing` の名前と米ドル。返った値のまま） */
export interface ModelPrice {
  readonly name: string;
  readonly usd: number;
  /** 1 トークンあたりの値か（`prompt`・`completion`・`input_cache_*`・`internal_reasoning`） */
  readonly perToken: boolean;
}

/** 条件つきの費用（`pricing.overrides` の 1 件）。条件は `min_prompt_tokens`・`utc_start` など */
export interface ModelPriceTier {
  readonly conditions: readonly { readonly name: string; readonly value: number }[];
  readonly prices: readonly ModelPrice[];
}

/** ベンチマークの 1 件。`source` は `artificial_analysis` / `design_arena` など */
export interface ModelBenchmark {
  readonly source: string;
  readonly label: string;
  readonly values: readonly { readonly name: string; readonly value: number }[];
}

/** 思考（`reasoning`）の扱い */
export interface ModelReasoning {
  /** 思考を止められない（思考モデル） */
  readonly mandatory: boolean;
  /** 既定で思考するか。わからなければ null */
  readonly defaultEnabled: boolean | null;
  readonly efforts: readonly string[];
  readonly defaultEffort: string | null;
}

/** 一覧の項目の付帯情報（OpenRouter）。返さないサーバーでは作らない */
export interface ModelDetails {
  readonly description: string | null;
  /** 作られた時刻（`created`。UNIX 秒）。無ければ null */
  readonly created: number | null;
  readonly prices: readonly ModelPrice[];
  readonly priceTiers: readonly ModelPriceTier[];
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly benchmarks: readonly ModelBenchmark[];
  /** `reasoning` の項目。無ければ null */
  readonly reasoning: ModelReasoning | null;
  /** 要求の `reasoning` 引数を受けるか（`supported_parameters`） */
  readonly reasoningParam: boolean;
  /**
   * 上の項目に出さない残りすべて（入れ子は `.` でつないだ名前、並びは `, ` でつないだ値）。
   * 値の無い項目（null・空）は含めない
   */
  readonly others: readonly { readonly name: string; readonly value: string }[];
}

/**
 * モデルの一覧と、わかった文脈長（入力と出力を合わせたトークン数の上限）。
 * 文脈長を返さないサーバーもある（OpenAI など）ので、どちらも空のことがある
 */
export interface ModelList {
  readonly ids: readonly string[];
  /** モデルごとの文脈長（一覧の項目に書いてあったもの） */
  readonly contexts: Readonly<Record<string, number>>;
  /** モデルごとの付帯情報（返すサーバーだけ） */
  readonly details: Readonly<Record<string, ModelDetails>>;
  /** サーバーが今の設定で使う文脈長（llama.cpp の `/props`）。一覧の値より優先する */
  readonly serverContext: number | null;
  /**
   * 上限の件数を超えた分を捨てたか
   */
  readonly truncated: boolean;
}

/** LLM の要求の結果。投げずに、値か失敗のどちらかで返す */
export type LlmResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: LlmFailure };

/** LLM の窓口。モデルの一覧・キーの確かめ・Chat Completions の受け取り */
export interface LlmPort {
  /**
   * `GET /models` の `data[].id` と文脈長。形の合わない応答は空の一覧として返す（打ち込んで続けられる）。
   * llama.cpp なら `GET /props` も読む（読めなくても一覧は返す）
   */
  readonly listModels: (
    endpoint: LlmEndpoint,
    signal?: AbortSignal,
  ) => Promise<LlmResult<ModelList>>;
  /**
   * `GET /key` で API キーが通るかを確かめる（OpenRouter のキーの情報。モデルの一覧はキーが無くても取れるため）。
   * 中身は読まない。断られたら `auth` などの失敗
   */
  readonly checkKey: (endpoint: LlmEndpoint, signal?: AbortSignal) => Promise<LlmResult<null>>;
  /**
   * `POST /chat/completions` を送り、届いたものを順に `onEvent` へ渡す。終わったら返る。
   * `signal` で止めたら `stopped` の失敗を返す（届いた分は渡し終えている）。`onRaw` があれば、
   * 受け取った本文をそのまま渡す（ストリーミングなら空でない行ごと、1 つの JSON ならその全文）
   */
  readonly streamChat: (
    endpoint: LlmEndpoint,
    request: ChatCompletionRequest,
    receiver: ChatStreamReceiver,
  ) => Promise<LlmResult<null>>;
}

/** 生成の応答の受け手と、止める合図 */
export interface ChatStreamReceiver {
  readonly onEvent: (event: ChatStreamEvent) => void;
  readonly signal: AbortSignal;
  readonly onRaw?: ((text: string) => void) | undefined;
}
