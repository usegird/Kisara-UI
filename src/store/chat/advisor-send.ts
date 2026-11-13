import { endpointOf } from '@/chat/connection-profile';
import { applyMacros } from '@/chat/macros';
import {
  ADVISOR_USES,
  type AdvisorGuide,
  type AdvisorMessage,
  type AdvisorTarget,
  type AdvisorToolCall,
  type AdvisorUse,
} from '@/chat/prompt-advisor';
import {
  advisorSummaryRange,
  advisorSummaryRequest,
  advisorSummaryText,
  advisorUnsummarized,
  type AdvisorSummary,
} from '@/chat/prompt-advisor-summary';
import { advisorContextText, advisorGreeting, advisorMessages } from '@/chat/prompt-advisor-text';
import {
  advisorCallKey,
  advisorCallResult,
  advisorCallStatus,
  advisorToolOf,
} from '@/chat/prompt-advisor-tool';
import { buildAdvisorRequest, buildSummaryRequest } from '@/chat/request';
import { mergeCitations, textWithDelta } from '@/chat/stream-receive';
import { addToolCallPart } from '@/chat/tool-calls';
import type { Chat, ConnectionProfile, ToolCallRecord } from '@/chat/types';
import type { WebTools } from '@/chat/web-tools';
import { t, type MessageKey } from '@/i18n';
import { newShortId } from '@/lib/id';
import type {
  ChatCompletionRequest,
  ChatStreamEvent,
  LlmFailure,
  ToolDefinition,
} from '@/port/llm-port';
import { currentLlmTarget, learnOverflow, type LlmTarget } from '@/store/chat/llm-target';
import { llmPort } from '@/store/ports/llm-port';
import { currentInputLimit, sourcesOf, useChatStore } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { webToolsFor } from '@/store/use-web-search-store';

// ─────────────────────────────
// 構成の相談の 1 つの形と、LLM へ送る・要約させる手続き（相談の並びはストアが持つ）。
// 付加情報は初めて送るときに作って相談に持ち、2 通目からはそれを送る
// ─────────────────────────────

const GREETING_TEXT: Readonly<Record<AdvisorUse, MessageKey>> = {
  blank: 'llm.advisor.greeting.blank',
  work: 'llm.advisor.greeting.work',
  story: 'llm.advisor.greeting.story',
  roleplay: 'llm.advisor.greeting.roleplay',
  game: 'llm.advisor.greeting.game',
};

/** 構成の相談の 1 つ */
export interface AdvisorSession {
  readonly id: string;
  readonly chatId: string;
  /** 選んだ初期メッセージの候補（ADVISOR_USES の位置） */
  readonly greeting: number;
  /**
   * 外から渡した勘所。あれば候補の代わりにこれを初期メッセージにし、切り替えない
   */
  readonly guide?: AdvisorGuide | undefined;
  /** 初めて送ったときの付加情報。2 通目からもこれを送る（送る前は無い） */
  readonly sentContext?: string | undefined;
  readonly messages: readonly AdvisorMessage[];
  /** 相談の要約（要約したときだけ） */
  readonly summary?: AdvisorSummary | undefined;
  /** 要約しているか */
  readonly summarizing: boolean;
  /** 欄を開いているか */
  readonly isOpen: boolean;
  readonly streaming: boolean;
  /** 受け取り中の要求を送った時刻（`performance.now()` の ms。経過時間を出す） */
  readonly sentAt?: number | undefined;
  readonly failure: LlmFailure | null;
  readonly draft: string;
  /** 反映した案（`proposalKey`）と、当てる直前の値 */
  readonly applied: Readonly<Record<string, AdvisorTarget>>;
}

/** 相談 1 つを書き換える手続き */
export type SessionPatch = (id: string, edit: (session: AdvisorSession) => AdvisorSession) => void;

/** 送る・要約する手続きが読み書きするストア */
interface SessionAccess {
  readonly get: () => { readonly sessions: Readonly<Record<string, AdvisorSession>> };
  readonly patch: SessionPatch;
}

/** 受け取り中・要約している要求。相談ごとに 1 つ */
const controllers = new Map<string, AbortController>();

/** 初期メッセージの候補の用途 */
export function greetingUse(index: number): AdvisorUse {
  return ADVISOR_USES[index] ?? ADVISOR_USES[0];
}

/** 初期メッセージの候補の見せる文（画面の言語） */
export function formatGreeting(index: number): string {
  return t(GREETING_TEXT[greetingUse(index)]);
}

/** 相談の初期メッセージの用途と見せる文。勘所を渡した相談はその文 */
export function sessionGreeting(session: Pick<AdvisorSession, 'greeting' | 'guide'>): {
  readonly use: AdvisorUse;
  readonly visible: string;
} {
  return session.guide === undefined
    ? { use: greetingUse(session.greeting), visible: formatGreeting(session.greeting) }
    : { use: session.guide.use, visible: session.guide.visible };
}

/** 受け取り中・要約している要求を止める（相談は残す） */
export function stopAdvice(id: string): void {
  controllers.get(id)?.abort();
}

/** 受け取り中・要約している要求を止めて忘れる（相談を終えるとき） */
export function dropAdvice(id: string): void {
  controllers.get(id)?.abort();
  controllers.delete(id);
}

/**
 * 打ちかけ（`text` があればその文。打ちかけは残す）を送り、返る発言へ受け取る。空・受け取り中・
 * 要約している間は何もしない
 */
export async function sendAdvice(store: SessionAccess, id: string, text?: string): Promise<void> {
  const session = store.get().sessions[id];
  const chat = session === undefined ? undefined : useChatStore.getState().chats[session.chatId];
  if (session === undefined || chat === undefined || session.streaming || session.summarizing) {
    return;
  }
  const content = (text ?? session.draft).trim();
  if (content.length === 0) return;
  const user: AdvisorMessage = { id: newShortId(), role: 'user', content };
  const reply: AdvisorMessage = { id: newShortId(), role: 'assistant', content: '' };
  const history = [...session.messages, user];
  const target = currentLlmTarget();
  const profile = profileOf(target);
  if (profile === undefined) {
    store.patch(id, (current) => ({
      ...current,
      messages: history,
      draft: text === undefined ? '' : current.draft,
      failure: { kind: 'not-found' },
    }));
    return;
  }
  const { use, visible } = sessionGreeting(session);
  const context = session.sentContext ?? advisorContextText(chat, use, session.guide ?? null);
  store.patch(id, (current) => ({
    ...current,
    sentContext: context,
    messages: [...history, reply],
    draft: text === undefined ? '' : current.draft,
    streaming: true,
    sentAt: performance.now(),
    failure: null,
  }));
  const controller = new AbortController();
  controllers.set(id, controller);
  // Web 検索・取得の注意は有効にするときに確かめたので、送るときは確かめない
  const web = webToolsFor(profile.baseUrl, 'advisor');
  const opening = {
    greeting: advisorGreeting(visible, context),
    summary: advisorSummaryText(session.summary),
    // 呼び出しの結果は、送るときに反映したかで作る
    callResult: (call: AdvisorToolCall, messageId: string): string => {
      const applied = session.applied[advisorCallKey(messageId, call.id)];
      return advisorCallResult(advisorCallStatus(call, applied));
    },
  };
  const result = await llmPort().streamChat(
    endpointOf(profile),
    advisorRequestOf(chat, opening, advisorUnsummarized(history, session.summary), {
      target,
      web,
      proposal: advisorToolOf(use, session.guide?.outline ?? null),
    }),
    {
      onEvent: createReplyReceiver((edit) =>
        store.patch(id, (current) => ({
          ...current,
          messages: current.messages.map((message) =>
            message.id === reply.id ? edit(message) : message,
          ),
        })),
      ),
      signal: controller.signal,
    },
  );
  // 終えた相談・別の要求に替わったものは触らない
  if (controllers.get(id) !== controller) return;
  controllers.delete(id);
  // 上限を超えて断られたら、読めた文脈長を覚える（次からの知らせと要約に渡す量に使う）
  if (!result.ok) learnOverflow(target, result.failure);
  store.patch(id, (current) => ({
    ...current,
    // 呼び出しの id は相談の中で重ならないものに付け直す（LLM の id は空や重なりがある）
    messages: current.messages.map((message) =>
      message.id === reply.id ? withCallIds(message) : message,
    ),
    streaming: false,
    failure: result.ok || result.failure.kind === 'stopped' ? null : result.failure,
  }));
}

/** 発言の呼び出しに、相談の中で重ならない id を付ける */
function withCallIds(message: AdvisorMessage): AdvisorMessage {
  if (message.toolCalls === undefined) return message;
  return {
    ...message,
    toolCalls: message.toolCalls.map((call, index) => ({
      ...call,
      id: `call_${message.id}_${String(index)}`,
    })),
  };
}

/**
 * 新しい 4 件の手前までの発言と前の要約を要約させ、相談の要約を置き換える。縮めるものが無い・
 * 受け取り中・要約している間は何もしない。渡す分は送れる上限に収まるだけにする
 */
export async function summarizeAdvice(store: SessionAccess, id: string): Promise<void> {
  const session = store.get().sessions[id];
  if (session === undefined || session.streaming || session.summarizing) return;
  const range = advisorSummaryRange(session.messages, session.summary);
  if (range === null) return;
  const target = currentLlmTarget();
  const profile = profileOf(target);
  if (profile === undefined) {
    store.patch(id, (current) => ({ ...current, failure: { kind: 'not-found' } }));
    return;
  }
  const request = advisorSummaryRequest(session.messages, session.summary, {
    range,
    limit: currentInputLimit(),
  });
  const upTo = session.messages[request.range.to - 1]?.id;
  if (upTo === undefined) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  store.patch(id, (current) => ({ ...current, summarizing: true, failure: null }));
  let text = '';
  const result = await llmPort().streamChat(
    endpointOf(profile),
    buildSummaryRequest(request.messages, {
      model: target.model,
      params: useSettingsStore.getState().llmParams,
    }),
    {
      onEvent: (event) => {
        if (event.kind === 'delta') text = textWithDelta(text, event);
      },
      signal: controller.signal,
    },
  );
  if (controllers.get(id) !== controller) return;
  controllers.delete(id);
  if (!result.ok) learnOverflow(target, result.failure);
  store.patch(id, (current) => ({
    ...current,
    summarizing: false,
    ...summaryOutcome(result.ok ? null : result.failure, text.trim(), upTo),
  }));
}

/** 要約の結果で変える所。失敗（止めたのは除く）か、空の本文なら失敗を出し、要約は変えない */
function summaryOutcome(
  failure: LlmFailure | null,
  content: string,
  upTo: string,
): Partial<AdvisorSession> {
  if (failure !== null) return { failure: failure.kind === 'stopped' ? null : failure };
  if (content.length === 0) return { failure: { kind: 'bad-response' } };
  return { summary: { content, upTo } };
}

/** 今の接続の設定。設定かモデルを選んでいなければ undefined */
function profileOf(target: LlmTarget): ConnectionProfile | undefined {
  if (target.model.trim().length === 0) return undefined;
  return useLlmProfilesStore.getState().profiles.find((item) => item.id === target.profileId);
}

/**
 * 相談の要求の本文。初期メッセージ（持った付加情報を埋め込む）と要約は渡された物を使う
 */
function advisorRequestOf(
  chat: Chat,
  opening: Parameters<typeof advisorMessages>[2],
  history: readonly AdvisorMessage[],
  tools: {
    readonly target: LlmTarget;
    readonly web: WebTools | null;
    readonly proposal: ToolDefinition;
  },
): ChatCompletionRequest {
  return buildAdvisorRequest(
    advisorMessages(useSettingsStore.getState().llmSystemPrompt, history, opening, (value) =>
      applyMacros(value, sourcesOf(chat)),
    ),
    { model: tools.target.model, params: useSettingsStore.getState().llmParams },
    tools.web,
    tools.proposal,
  );
}

/**
 * 返る発言へ届いた知らせを足す受け手。使ったトークン数・Web のツールの回数と費用・出典は
 * 返った発言に添えて見せる（会話と同じ）
 */
function createReplyReceiver(
  setReply: (edit: (message: AdvisorMessage) => AdvisorMessage) => void,
): (event: ChatStreamEvent) => void {
  let text = '';
  let reasoning = '';
  let calls: ToolCallRecord[] = [];
  return (event) => {
    // 案は案を書かせるツールの呼び出しで届く（引数は断片で届くので足していく）
    if (event.kind === 'tool-call') {
      calls = addToolCallPart(calls, event);
      const toolCalls = calls.map((call) => ({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
      }));
      setReply((message) => ({ ...message, toolCalls }));
      return;
    }
    if (event.kind === 'usage') {
      setReply((message) => ({ ...message, usage: event.usage }));
      return;
    }
    // 長さで切れたかを知らせに使う
    if (event.kind === 'finish') {
      setReply((message) => ({ ...message, finishReason: event.reason }));
      return;
    }
    if (event.kind === 'billing') {
      setReply((message) => ({ ...message, billing: { ...message.billing, ...event.billing } }));
      return;
    }
    if (event.kind === 'citations') {
      setReply((message) => {
        const citations = mergeCitations(message.citations ?? [], event.citations);
        return citations.length === 0 ? message : { ...message, citations };
      });
      return;
    }
    if (event.kind !== 'delta') return;
    text = textWithDelta(text, event);
    reasoning += event.reasoning;
    setReply((message) => ({
      ...message,
      content: text,
      ...(reasoning.length === 0 ? {} : { reasoning }),
    }));
  };
}
