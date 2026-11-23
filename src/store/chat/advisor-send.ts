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

const GREETING_TEXT: Readonly<Record<AdvisorUse, MessageKey>> = {
  blank: 'llm.advisor.greeting.blank',
  work: 'llm.advisor.greeting.work',
  story: 'llm.advisor.greeting.story',
  roleplay: 'llm.advisor.greeting.roleplay',
  game: 'llm.advisor.greeting.game',
};

export interface AdvisorSession {
  readonly id: string;
  readonly chatId: string;
  readonly greeting: number;
  readonly guide?: AdvisorGuide | undefined;
  readonly sentContext?: string | undefined;
  readonly messages: readonly AdvisorMessage[];
  readonly summary?: AdvisorSummary | undefined;
  readonly summarizing: boolean;
  readonly isOpen: boolean;
  readonly streaming: boolean;
  readonly sentAt?: number | undefined;
  readonly failure: LlmFailure | null;
  readonly draft: string;
  readonly applied: Readonly<Record<string, AdvisorTarget>>;
}

export type SessionPatch = (id: string, edit: (session: AdvisorSession) => AdvisorSession) => void;

interface SessionAccess {
  readonly get: () => { readonly sessions: Readonly<Record<string, AdvisorSession>> };
  readonly patch: SessionPatch;
}

const controllers = new Map<string, AbortController>();

export function greetingUse(index: number): AdvisorUse {
  return ADVISOR_USES[index] ?? ADVISOR_USES[0];
}

export function formatGreeting(index: number): string {
  return t(GREETING_TEXT[greetingUse(index)]);
}

export function sessionGreeting(session: Pick<AdvisorSession, 'greeting' | 'guide'>): {
  readonly use: AdvisorUse;
  readonly visible: string;
} {
  return session.guide === undefined
    ? { use: greetingUse(session.greeting), visible: formatGreeting(session.greeting) }
    : { use: session.guide.use, visible: session.guide.visible };
}

export function stopAdvice(id: string): void {
  controllers.get(id)?.abort();
}

export function dropAdvice(id: string): void {
  controllers.get(id)?.abort();
  controllers.delete(id);
}

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
  const web = webToolsFor(profile.baseUrl, 'advisor');
  const opening = {
    greeting: advisorGreeting(visible, context),
    summary: advisorSummaryText(session.summary),
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
  if (controllers.get(id) !== controller) return;
  controllers.delete(id);
  if (!result.ok) learnOverflow(target, result.failure);
  store.patch(id, (current) => ({
    ...current,
    messages: current.messages.map((message) =>
      message.id === reply.id ? withCallIds(message) : message,
    ),
    streaming: false,
    failure: result.ok || result.failure.kind === 'stopped' ? null : result.failure,
  }));
}

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

function summaryOutcome(
  failure: LlmFailure | null,
  content: string,
  upTo: string,
): Partial<AdvisorSession> {
  if (failure !== null) return { failure: failure.kind === 'stopped' ? null : failure };
  if (content.length === 0) return { failure: { kind: 'bad-response' } };
  return { summary: { content, upTo } };
}

function profileOf(target: LlmTarget): ConnectionProfile | undefined {
  if (target.model.trim().length === 0) return undefined;
  return useLlmProfilesStore.getState().profiles.find((item) => item.id === target.profileId);
}

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

function createReplyReceiver(
  setReply: (edit: (message: AdvisorMessage) => AdvisorMessage) => void,
): (event: ChatStreamEvent) => void {
  let text = '';
  let reasoning = '';
  let calls: ToolCallRecord[] = [];
  return (event) => {
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
