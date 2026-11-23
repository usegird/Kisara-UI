const BOTH = 'shell / PowerShell';

const OLLAMA_DEFAULT_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '0.0.0.0'];

interface LaunchSample {
  readonly label: string;
  readonly command: string;
}

type CorsReason =
  | 'llm.onboarding.reasonOllama'
  | 'llm.onboarding.reasonLmStudio'
  | 'llm.onboarding.reasonLlamaCpp'
  | 'llm.onboarding.reasonVllm';

export type CorsLevel = 'required' | 'recommended' | 'unavailable' | 'notNeeded';

export interface ServerGuide {
  readonly key: string;
  readonly name: string;
  readonly url: string;
  readonly cors: (
    local: boolean,
  ) => { readonly level: CorsLevel; readonly reason: CorsReason } | null;
  readonly modelRequired?: true;
  readonly keyAt?: string;
  readonly commands: (origin: string, local: boolean) => readonly LaunchSample[];
}

const FALLBACK_SERVER: ServerGuide = {
  key: 'none',
  name: '',
  url: 'http://127.0.0.1:11434/v1',
  cors: () => ({ level: 'notNeeded', reason: 'llm.onboarding.reasonOllama' }),
  commands: () => [],
};

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

export function firstServer(): ServerGuide {
  return SERVERS[0] ?? FALLBACK_SERVER;
}

export function ollamaAllows(origin: string): boolean {
  try {
    return OLLAMA_DEFAULT_HOSTS.includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}
