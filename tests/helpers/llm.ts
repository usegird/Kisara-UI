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
  LlmPort,
  LlmResult,
  ModelDetails,
  ModelList,
} from '@/port/llm-port';
import type { OwnPlaybook } from '@/store/use-playbooks-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// LLM の窓口と会話の組み立て。通信は作り物の窓口で済ませ、`POST /chat/completions` を
// 本物に送らない（課金や資源の消費が起きるため）。
// ─────────────────────────────

/**
 * そろえたカードの、送る中身を組むときの欄。読み込みと同じく、カードの欄とロアブックをプリセットへ
 * 写したものから作る
 */
export function cardView(card: Record<string, unknown>): CardView {
  return characterView(cardFields(card), cardLorebook(card)?.entries);
}

/**
 * 文面の項目を持つ構成（初めの構成は印だけなので、項目の操作や組み立てを試すときに使う）。口調・決まり・
 * 例・追加辞書の印・会話履歴・メッセージ・発言に添える指示・考え方・出力の形の順。本文はどれも空
 */
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

/** SSE の本文を、指定した区切りごとに届く `Response` にする */
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

/** Chat Completions のストリーミングの 1 件の `data:` 行 */
export function deltaLine(content: string, extra: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content, ...extra } }] })}\n\n`;
}

export interface FakeLlmPort extends LlmPort {
  /** 送られた要求 */
  readonly requests: Parameters<LlmPort['streamChat']>[1][];
  /** 受け取りを終える（`streamChat` の返りを解決する） */
  readonly finish: (result?: LlmResult<null>) => void;
  /** 届いたものを流す */
  readonly emit: (event: ChatStreamEvent) => void;
}

/** モデルの付帯情報。既定は空（渡した項目だけ埋める） */
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

/** 文脈長のわからないモデルの一覧 */
export function modelList(ids: readonly string[]): ModelList {
  return { ids, contexts: {}, details: {}, serverContext: null, truncated: false };
}

/** 呼び出し側が手で流して終える窓口。止めると `stopped` で終わる */
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
  /**
   * 全部の候補に添える画像（データ URL）
   */
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

/** 交互に n 件の発言（m0 は user、m1 は assistant、…）。本文は「m<番号> 」と長さ `size` の埋め草 */
export function chatTurns(n: number, size = 40): ChatMessage[] {
  return Array.from({ length: n }, (_, index) =>
    chatMessage(`m${String(index)}`, index % 2 === 0 ? 'user' : 'assistant', [
      `m${String(index)} ${'x'.repeat(size)}`,
    ]),
  );
}

/**
 * ロアの 1 項目。既定は用語と定義の表から取り込んだ項目と同じ
 */
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

/**
 * 送る中身に渡すモデルと生成の設定（全体で持つもの）。モデルは 'model-a'
 */
export function llm(params: GenerationParams = {}): {
  readonly model: string;
  readonly params: GenerationParams;
} {
  return { model: 'model-a', params };
}

/** 全体の接続の設定とモデルを 'p1'・'model-a' にする（生成の設定は何も決めない） */
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

/** 送る発言の本文の文字（部品の配列なら text の部品をつないだもの。画像は数えない） */
export function contentText(message: ChatRequestMessage): string {
  const content = message.content;
  if (content === null || typeof content === 'string') return content ?? '';
  return content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}

/** ワークフローの呼び出しを持つ `assistant`（受け取り終えた候補 1 つ） */
export function toolCallMessage(id: string, calls: readonly ToolCallRecord[]): ChatMessage {
  const candidate: Candidate = {
    content: '',
    reasoning: '',
    end: { kind: 'done', reason: 'tool_calls' },
    toolCalls: calls,
  };
  return { id, role: 'assistant', candidates: [candidate], selected: 0 };
}

/** 試しのプレイブックの id（自分のプレイブックとして一覧に置く。`ownPlaybooks`） */
export const TEST_PLAYBOOK_ID = 'pb';

/**
 * 会話が持つ参照（試しのプレイブックの、そのフェーズ）
 */
export function playbookRef(phase = 'plan'): ChatPlaybookRef {
  return { origin: 'own', id: TEST_PLAYBOOK_ID, phase };
}

/** 自分のプレイブックの一覧に置く形（`usePlaybooksStore.setState({ playbooks: ownPlaybooks() })`） */
export function ownPlaybooks(): Record<string, OwnPlaybook> {
  const { playbook } = chatPlaybook();
  return { [TEST_PLAYBOOK_ID]: { id: TEST_PLAYBOOK_ID, playbook, createdAt: 0, updatedAt: 0 } };
}

/**
 * 2 フェーズの試しのプレイブックを引いた形（定義と今のフェーズ）。会話には
 * `playbookRef` を、辞書には `outlineBook` を置く。`patch` で今のフェーズなどを替える
 */
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

/**
 * プレイブックの辞書（`##playbook`）。段ごとに題を受け取り、`*, outline` の常時の項目にする。
 * `enabled` の位置の段だけを有効にする（null ならどれも切る）。`memo` があれば `*, memo` の項目を足す
 */
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
