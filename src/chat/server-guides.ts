// ─────────────────────────────
// LLM の接続の案内に並べるサーバーの表（起動コマンド・CORS の設定の区分・ベース URL の例）。
// 文言は文言の表の鍵で持ち、引くのは画面の側。
// ─────────────────────────────

/** 起動コマンドの見出し（どちらのシェルでも同じコマンドのとき） */
const BOTH = 'shell / PowerShell';

/** Ollama が既定で許す出どころの名前（どのポートでも） */
const OLLAMA_DEFAULT_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '0.0.0.0'];

/**
 * サーバーごとの起動コマンド。どれもモデルを指定せずに起動する形で、実行ファイルから書く。
 * どのサーバーも同じ並び（コマンド → CORS の設定の区分 → ベース URL）にする。許す設定を書くときは
 * このページの出どころ（origin）を指定してコマンドに含める（LM Studio だけは出どころを選べない）。
 * Ollama だけは、区分とコマンドがこのページの出どころで変わる
 */
interface LaunchSample {
  readonly label: string;
  readonly command: string;
}

/** CORS の設定の区分の理由（文言の表の鍵） */
type CorsReason =
  | 'llm.onboarding.reasonOllama'
  | 'llm.onboarding.reasonLmStudio'
  | 'llm.onboarding.reasonLlamaCpp'
  | 'llm.onboarding.reasonVllm';

/**
 * CORS の設定の区分。必須は既定で許さない・推奨は既定でどのページも許すので範囲を絞る・
 * 不可は許す範囲を絞る機能が無い・不要はこのページを既定で許す
 */
export type CorsLevel = 'required' | 'recommended' | 'unavailable' | 'notNeeded';

/** 案内に並べるサーバー 1 つ */
export interface ServerGuide {
  readonly key: string;
  readonly name: string;
  readonly url: string;
  /**
   * CORS の設定の区分とその理由（行を出さないときは null）。`local` はこのページが Ollama の既定で
   * 許す出どころか
   */
  readonly cors: (
    local: boolean,
  ) => { readonly level: CorsLevel; readonly reason: CorsReason } | null;
  /** モデルを起動のときに指定するか（指定するサーバーだけモデルの行を出す） */
  readonly modelRequired?: true;
  /** API キーを発行する場所（クラウドだけ。キーの発行の行を出す） */
  readonly keyAt?: string;
  readonly commands: (origin: string, local: boolean) => readonly LaunchSample[];
}

/** 一覧が空になったときの代わり（一覧は空にしないので使わない） */
const FALLBACK_SERVER: ServerGuide = {
  key: 'none',
  name: '',
  url: 'http://127.0.0.1:11434/v1',
  cors: () => ({ level: 'notNeeded', reason: 'llm.onboarding.reasonOllama' }),
  commands: () => [],
};

/** 手元で動かすサーバーの例 */
export const SERVERS: readonly ServerGuide[] = [
  {
    key: 'ollama',
    name: 'Ollama',
    url: 'http://127.0.0.1:11434/v1',
    cors: (local) => ({
      level: local ? 'notNeeded' : 'required',
      reason: 'llm.onboarding.reasonOllama',
    }),
    commands: (origin, local) =>
      local
        ? [{ label: BOTH, command: 'ollama serve' }]
        : [
            { label: 'shell', command: `OLLAMA_ORIGINS=${origin} ollama serve` },
            { label: 'PowerShell', command: `$env:OLLAMA_ORIGINS="${origin}"; ollama serve` },
          ],
  },
  {
    key: 'lm-studio',
    name: 'LM Studio',
    url: 'http://127.0.0.1:1234/v1',
    cors: () => ({ level: 'required', reason: 'llm.onboarding.reasonLmStudio' }),
    commands: () => [{ label: BOTH, command: 'lms server start --cors --port 1234' }],
  },
  {
    key: 'llama-cpp',
    name: 'llama.cpp',
    url: 'http://127.0.0.1:8080/v1',
    cors: () => ({ level: 'recommended', reason: 'llm.onboarding.reasonLlamaCpp' }),
    commands: (origin) => [
      {
        label: BOTH,
        command: `llama-server --models-dir ./models --port 8080 --cors-origins ${origin}`,
      },
    ],
  },
  {
    key: 'vllm',
    modelRequired: true,
    name: 'vLLM',
    url: 'http://127.0.0.1:8000/v1',
    cors: () => ({ level: 'required', reason: 'llm.onboarding.reasonVllm' }),
    commands: (origin) => [
      {
        label: 'shell',
        command: `vllm serve <model> --port 8000 --allowed-origins '["${origin}"]'`,
      },
    ],
  },
];

/** クラウドの例。起動コマンドの代わりに API キーを発行する場所だけを出す（ブラウザからの要求を許す） */
export const CLOUD_SERVERS: readonly ServerGuide[] = [
  {
    key: 'openrouter',
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1',
    keyAt: 'https://openrouter.ai/keys',
    cors: () => null,
    commands: () => [],
  },
];

/** 最初に例にするサーバー（手元の一覧の先頭） */
export function firstServer(): ServerGuide {
  return SERVERS[0] ?? FALLBACK_SERVER;
}

/** このページの出どころを Ollama が既定で許すか（localhost・127.0.0.1・0.0.0.0。どのポートでも） */
export function ollamaAllows(origin: string): boolean {
  try {
    return OLLAMA_DEFAULT_HOSTS.includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}
