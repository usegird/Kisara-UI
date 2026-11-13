import { normalizeInRange } from '@/lib/clamp';
import type { ServerTool } from '@/port/llm-port';

// ─────────────────────────────
// OpenRouter の Web 検索・取得の設定と、送るツールの組み立て。
// ─────────────────────────────

/** 検索の選択肢。`エンジン:モード` か、モードを持たないエンジン（自動・Perplexity） */
export type SearchEngine =
  | 'off'
  | 'auto'
  | 'parallel:turbo'
  | 'parallel:fast'
  | 'parallel:basic'
  | 'parallel:advanced'
  | 'exa:instant'
  | 'exa:fast'
  | 'exa:auto'
  | 'exa:deep-lite'
  | 'exa:deep'
  | 'perplexity';

/** 設定の選択肢の並び（先頭は無効） */
export const SEARCH_ENGINES: readonly SearchEngine[] = [
  'off',
  'auto',
  'parallel:turbo',
  'parallel:fast',
  'parallel:basic',
  'parallel:advanced',
  'exa:instant',
  'exa:fast',
  'exa:auto',
  'exa:deep-lite',
  'exa:deep',
  'perplexity',
];

/** 既定は Parallel の fast（basic の 5 分の 1 の料金。公式ドキュメント） */
export const DEFAULT_SEARCH_ENGINE: SearchEngine = 'parallel:fast';

/** 検索の選択肢のエンジンとモード（自動は両方とも無い） */
export function searchEngineParts(option: SearchEngine): {
  readonly engine: string | null;
  readonly mode: string | null;
} {
  if (option === 'off' || option === 'auto') return { engine: null, mode: null };
  const [engine = option, mode = null] = option.split(':');
  return { engine, mode };
}

/** 手数の上限（`max_tool_calls`）。OpenRouter の上限は 30（公式ドキュメント） */
export const WEB_CALLS = { initial: 5, min: 1, max: 30 } as const;
/** 取得の本文の上限（`max_content_tokens`。おおよそのトークン数） */
export const WEB_CONTENT_TOKENS = { initial: 32768, min: 256, max: 200000 } as const;

/** 保存値を検索の選択肢にする。知らない値は既定 */
export function normalizeSearchEngine(value: unknown): SearchEngine {
  return SEARCH_ENGINES.find((engine) => engine === value) ?? DEFAULT_SEARCH_ENGINE;
}

/** 保存値を手数の上限の範囲に収める */
export function normalizeWebCalls(value: unknown): number {
  return normalizeInRange(value, WEB_CALLS, { round: true });
}

/** 保存値を取得の本文の上限の範囲に収める */
export function normalizeContentTokens(value: unknown): number {
  return normalizeInRange(value, WEB_CONTENT_TOKENS, { round: true });
}

/** Web 検索の設定（使用ツールと 2 つの上限） */
export interface WebSettings {
  readonly search: SearchEngine;
  readonly calls: number;
  readonly contentTokens: number;
}

/** 入力欄の状態のうち、送る方。検索は検索と取得（取得だけの状態は持たない） */
export type WebMode = 'search';

/** 送る Web のツールと手数の上限 */
export interface WebTools {
  readonly mode: WebMode;
  readonly calls: number;
  readonly tools: readonly ServerTool[];
}

/** 選べる状態（検索のエンジンを無効にしたら選べない） */
export function availableWebModes(settings: WebSettings): WebMode[] {
  return settings.search === 'off' ? [] : ['search'];
}

/** その状態で送るツール。エンジンが無効で送れなければ null */
export function webToolsOf(mode: WebMode, settings: WebSettings): WebTools | null {
  if (!availableWebModes(settings).includes(mode)) return null;
  const { engine, mode: searchMode } = searchEngineParts(settings.search);
  const search: ServerTool =
    engine === null
      ? { type: 'openrouter:web_search' }
      : {
          type: 'openrouter:web_search',
          parameters: { engine, ...(searchMode === null ? {} : { mode: searchMode }) },
        };
  const fetch = fetchToolOf(settings);
  return {
    mode,
    calls: settings.calls,
    tools: fetch === null ? [search] : [search, fetch],
  };
}

/** 選んだ使用ツールの提供元の取得。取得を持たない提供元（Perplexity）と無効は null */
function fetchEngineOf(option: SearchEngine): 'exa' | 'parallel' | 'auto' | null {
  if (option === 'auto') return 'auto';
  const { engine } = searchEngineParts(option);
  return engine === 'exa' || engine === 'parallel' ? engine : null;
}

function fetchToolOf(settings: WebSettings): ServerTool | null {
  const engine = fetchEngineOf(settings.search);
  if (engine === null) return null;
  return {
    type: 'openrouter:web_fetch',
    parameters: {
      // 自動はエンジンを付けない（OpenRouter の既定に任せる）
      ...(engine === 'auto' ? {} : { engine }),
      max_content_tokens: settings.contentTokens,
    },
  };
}
