import { cardFields, cardLorebook, characterView, type CardView } from '@/chat/card';
import type { LoreEntry, OwnLorebook } from '@/chat/lore';
import type { ChatPlaybook, ChatPlaybookRef } from '@/chat/playbook';
import {
  defaultComposition,
  type Candidate,
  type Chat,
  type ChatMessage,
  type ConnectionProfile,
  type PromptComposition,
  type PromptItem,
  type ToolCallRecord,
} from '@/chat/types';
import type {
  ChatRequestMessage,
  ChatStreamEvent,
  GenerationParams,
  LlmKeyPort,
  LlmPort,
  LlmResult,
  ModelDetails,
  ModelList,
} from '@/port/llm-port';
import type { OwnPlaybook } from '@/store/use-playbooks-store';
import { useSettingsStore } from '@/store/use-settings-store';

export function cardView(card: Record<string, unknown>): CardView {
  return characterView(cardFields(card), cardLorebook(card)?.entries);
}

export function sampleComposition(): PromptComposition {
  const base = defaultComposition();
  const text = (id: string, role: PromptItem['role']): PromptItem => ({
    id,
    name: '',
    role,
    marker: null,
    content: '',
    enabled: true,
    position: { kind: 'relative' },
  });
  const [info, history, input] = base.items;
  if (info === undefined || history === undefined || input === undefined) return base;
  return {
    ...base,
    items: [
      text('tone', 'system'),
      text('rules', 'system'),
      text('examples', 'system'),
      info,
      history,
      input,
      text('task', 'user'),
      text('thinking', 'user'),
      text('format', 'user'),
    ],
  };
}

export function sseResponse(chunks: readonly string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    ...init,
  });
}

export function deltaLine(content: string, extra: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content, ...extra } }] })}\n\n`;
}

export interface FakeLlmPort extends LlmPort {
  readonly requests: Parameters<LlmPort['streamChat']>[1][];
  readonly finish: (result?: LlmResult<null>) => void;
  readonly emit: (event: ChatStreamEvent) => void;
}

export function modelDetails(patch: Partial<ModelDetails> = {}): ModelDetails {
  return {
    description: null,
    created: null,
    prices: [],
    priceTiers: [],
    inputs: [],
    outputs: [],
    benchmarks: [],
    reasoning: null,
    reasoningParam: false,
    others: [],
    ...patch,
  };
}

export function modelList(ids: readonly string[]): ModelList {
  return { ids, contexts: {}, details: {}, serverContext: null, truncated: false };
}

export function fakeKeyPort(patch: Partial<LlmKeyPort> = {}): LlmKeyPort {
  return {
    keyedUrls: () => [],
    subscribe: () => () => undefined,
    openEntry: () => 'unready',
    onKeySet: () => () => undefined,
    reportVerified: () => undefined,
    forgetKey: () => undefined,
    ...patch,
  };
}

export function fakeLlmPort(models: readonly string[] = []): FakeLlmPort {
  const requests: Parameters<LlmPort['streamChat']>[1][] = [];
  let onEvent: ((event: ChatStreamEvent) => void) | null = null;
  let resolve: ((result: LlmResult<null>) => void) | null = null;
  return {
    requests,
    listModels: () => Promise.resolve({ ok: true, value: modelList(models) }),
    checkKey: () => Promise.resolve({ ok: true, value: null }),
    streamChat: (_endpoint, request, { onEvent: handler, signal }) => {
      requests.push(request);
      onEvent = handler;
      return new Promise((done) => {
        resolve = done;
        signal.addEventListener('abort', () => done({ ok: false, failure: { kind: 'stopped' } }));
      });
    },
    emit: (event) => onEvent?.(event),
    finish: (result = { ok: true, value: null }) => resolve?.(result),
  };
}

export function chatMessage(
  id: string,
  role: ChatMessage['role'],
  contents: readonly string[],
  selected = 0,
  images: readonly string[] = [],
): ChatMessage {
  return {
    id,
    role,
    candidates: contents.map((content) => ({
      content,
      reasoning: '',
      end: { kind: 'done', reason: null },
      ...(images.length > 0 ? { images } : {}),
    })),
    selected,
  };
}

export function chatTurns(n: number, size = 40): ChatMessage[] {
  return Array.from({ length: n }, (_, index) =>
    chatMessage(`m${String(index)}`, index % 2 === 0 ? 'user' : 'assistant', [
      `m${String(index)} ${'x'.repeat(size)}`,
    ]),
  );
}

export function loreEntry(patch: Partial<LoreEntry> = {}): LoreEntry {
  return {
    keys: [],
    secondaryKeys: [],
    logic: 'or',
    probability: 100,
    caseSensitive: false,
    content: '',
    enabled: true,
    constant: false,
    side: 'before',
    depth: null,
    historyStart: false,
    scanDepth: null,
    order: 100,
    priority: 100,
    comment: '',
    ...patch,
  };
}

export function chat(messages: readonly ChatMessage[] = [], patch: Partial<Chat> = {}): Chat {
  return {
    name: '',

    prompt: sampleComposition(),
    preset: null,
    character: null,
    persona: null,
    messages,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

export function llm(params: GenerationParams = {}): {
  readonly model: string;
  readonly params: GenerationParams;
} {
  return { model: 'model-a', params };
}

export function setDefaultLlm(): void {
  useSettingsStore.setState({ llmProfileId: 'p1', llmModel: 'model-a', llmParams: {} });
}

export function profile(patch: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    id: 'p1',
    baseUrl: 'http://x/v1',
    keyRequired: false,
    defaultModel: '',
    ...patch,
  };
}

export function contentText(message: ChatRequestMessage): string {
  const content = message.content;
  if (content === null || typeof content === 'string') return content ?? '';
  return content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}

export function toolCallMessage(id: string, calls: readonly ToolCallRecord[]): ChatMessage {
  const candidate: Candidate = {
    content: '',
    reasoning: '',
    end: { kind: 'done', reason: 'tool_calls' },
    toolCalls: calls,
  };
  return { id, role: 'assistant', candidates: [candidate], selected: 0 };
}

export const TEST_PLAYBOOK_ID = 'pb';

export function playbookRef(phase = 'plan'): ChatPlaybookRef {
  return { origin: 'own', id: TEST_PLAYBOOK_ID, phase };
}

export function ownPlaybooks(): Record<string, OwnPlaybook> {
  const { playbook } = chatPlaybook();
  return { [TEST_PLAYBOOK_ID]: { id: TEST_PLAYBOOK_ID, playbook, createdAt: 0, updatedAt: 0 } };
}

export function chatPlaybook(patch: Partial<ChatPlaybook> = {}): ChatPlaybook {
  return {
    playbook: {
      id: TEST_PLAYBOOK_ID,
      origin: 'own',
      name: 'Story',
      description: '',
      role: '',
      continue: 'Go on.',
      advisor: 'story',
      phases: [
        {
          id: 'plan',
          name: 'Plan',
          kind: 'decide',
          outline: 'single',
          goal: 'Make a plan',
          actions: [
            {
              kind: 'consult',
              id: 'c',
              name: 'Consult',
              greeting: 'Hello',
              instruction: 'Plan the steps.',
              outline: true,
            },
          ],
        },
        {
          id: 'write',
          name: 'Write',
          kind: 'proceed',
          outline: 'single',
          goal: 'Write the item',
          actions: [
            { kind: 'send', id: 'w', name: 'Write it', instruction: 'Write {{user}}.' },
            { kind: 'next', id: 'n', name: 'Next' },
          ],
        },
      ],
      standing: [],
      labels: {
        playbook: 'Playbook',
        role: 'Role',
        phase: 'Phase',
        picked: 'Picked',
      },
    },
    phase: 'plan',
    ...patch,
  };
}

export function outlineBook(titles: readonly string[], enabled: number | null = 0): OwnLorebook {
  return {
    id: 'book',
    name: '##playbook',
    entries: [
      ...titles.map((title, index) => ({
        ...loreEntry(),
        keys: [`【${title}】`],
        constant: true,
        comment: title,
        content: `${title} body`,
        enabled: index === enabled,
      })),
    ],
  };
}
