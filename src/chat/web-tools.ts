import { normalizeInRange } from '@/lib/clamp';
import type { ServerTool } from '@/port/llm-port';

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

export const DEFAULT_SEARCH_ENGINE: SearchEngine = 'parallel:fast';

export function searchEngineParts(option: SearchEngine): {
  readonly engine: string | null;
  readonly mode: string | null;
} {
  if (option === 'off' || option === 'auto') return { engine: null, mode: null };
  const [engine = option, mode = null] = option.split(':');
  return { engine, mode };
}

export const WEB_CALLS = { initial: 5, min: 1, max: 30 } as const;
export const WEB_CONTENT_TOKENS = { initial: 32768, min: 256, max: 200000 } as const;

export function normalizeSearchEngine(value: unknown): SearchEngine {
  return SEARCH_ENGINES.find((engine) => engine === value) ?? DEFAULT_SEARCH_ENGINE;
}

export function normalizeWebCalls(value: unknown): number {
  return normalizeInRange(value, WEB_CALLS, { round: true });
}

export function normalizeContentTokens(value: unknown): number {
  return normalizeInRange(value, WEB_CONTENT_TOKENS, { round: true });
}

export interface WebSettings {
  readonly search: SearchEngine;
  readonly calls: number;
  readonly contentTokens: number;
}

export type WebMode = 'search';

export interface WebTools {
  readonly mode: WebMode;
  readonly calls: number;
  readonly tools: readonly ServerTool[];
}

export function availableWebModes(settings: WebSettings): WebMode[] {
  return settings.search === 'off' ? [] : ['search'];
}

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
      ...(engine === 'auto' ? {} : { engine }),
      max_content_tokens: settings.contentTokens,
    },
  };
}
