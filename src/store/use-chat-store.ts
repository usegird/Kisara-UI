import { create } from 'zustand';

import type { LoreLibrary } from '@/chat/chat-sources';
import { appendTurn, isStreaming } from '@/chat/edit';
import type { PlaybookInstruction } from '@/chat/playbook';
import type { PlaybookChat, PlaybookPatch } from '@/chat/playbook-outline';
import type { SemanticHits } from '@/chat/semantic';
import { planSend } from '@/chat/tokens';
import type {
  Chat,
  ChatMessage,
  ChatPlace,
  PromptComposition,
  ToolCallGeneration,
  ToolCallState,
} from '@/chat/types';
import type { ChatCompletionRequest, LlmFailure } from '@/port/llm-port';
import { currentLlmTarget } from '@/store/chat/llm-target';
import { createChatDraftSlice } from '@/store/slices/chat-drafts';
import { refreshLoreDraft, requestOf, sendMaterials, sourcesOf } from '@/store/slices/chat-kit';
import { createChatMessageSlice } from '@/store/slices/chat-messages';
import { createChatOpenSlice } from '@/store/slices/chat-open';
import { createChatSendSlice } from '@/store/slices/chat-send';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';

export {
  canSend,
  chatLoreOf,
  chatSizeLevelOf,
  currentInputLimit,
  isBlocked,
  provideChatTools,
  receiveFreshToolCalls,
  sourcesOf,
  startResponseRecord,
} from '@/store/slices/chat-kit';

type ChatSaveState = 'saved' | 'unsaved' | 'full';

export type ChatPending =
  | { readonly kind: 'loading' }
  | { readonly kind: 'waiting'; readonly baseUrl: string; readonly both?: boolean }
  | { readonly kind: 'elsewhere' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'broken' }
  | { readonly kind: 'failed' };

interface DraftDirection {
  readonly instruction: PlaybookInstruction;
  readonly text: string;
}

export interface ToolCallAttempt {
  readonly id: string;
  readonly generation: ToolCallGeneration;
  readonly text: string;
}

export interface ChatState {
  readonly chats: Readonly<Record<string, Chat>>;
  readonly places: Readonly<Record<string, ChatPlace>>;
  readonly saveStates: Readonly<Record<string, ChatSaveState>>;
  readonly pending: Readonly<Record<string, ChatPending>>;
  readonly nearFull: boolean;
  readonly drafts: Readonly<Record<string, string>>;
  readonly draftImages: Readonly<Record<string, readonly string[]>>;
  readonly draftDirections: Readonly<Record<string, DraftDirection>>;
  readonly draftNotes: Readonly<Record<string, string>>;
  readonly loreDrafts: Readonly<Record<string, string>>;

  readonly add: () => string;
  readonly put: (chatId: string, chat: Chat, place?: ChatPlace) => void;
  readonly setPending: (chatId: string, pending: ChatPending | null) => void;
  readonly unload: (chatId: string) => void;
  readonly setPlace: (chatId: string, place: ChatPlace) => void;
  readonly setSaveState: (chatId: string, state: ChatSaveState) => void;
  readonly setNearFull: (nearFull: boolean) => void;
  readonly update: (chatId: string, patch: Partial<Omit<Chat, 'messages'>>) => void;
  readonly updatePrompt: (
    chatId: string,
    edit: (composition: PromptComposition) => PromptComposition | null,
  ) => void;
  readonly updatePlaybookChat: (
    chatId: string,
    edit: (chat: PlaybookChat) => PlaybookPatch | null,
  ) => void;
  readonly setPlaybook: (chatId: string, patch: PlaybookPatch | null) => void;
  readonly sendDirection: (
    chatId: string,
    parts: readonly string[],
    instruction: PlaybookInstruction,
  ) => void;
  readonly fillDirection: (
    chatId: string,
    parts: readonly string[],
    instruction: PlaybookInstruction,
  ) => void;
  readonly setDirectionText: (chatId: string, text: string) => void;
  readonly clearDirection: (chatId: string) => void;
  readonly setDraft: (chatId: string, text: string) => void;
  readonly setDraftNote: (chatId: string, note: string | null) => void;
  readonly addDraftImages: (chatId: string, images: readonly string[]) => void;
  readonly removeDraftImage: (chatId: string, index: number) => void;
  readonly send: (chatId: string) => void;
  readonly regenerate: (chatId: string) => void;
  readonly retry: (chatId: string) => void;
  readonly writeReply: (chatId: string) => void;
  readonly rollback: (chatId: string, messageId: string) => void;
  readonly stop: (chatId: string) => void;
  readonly clear: (chatId: string) => void;
  readonly selectCandidate: (chatId: string, messageId: string, index: number) => void;
  readonly updateMessage: (chatId: string, messageId: string, content: string) => void;
  readonly removeMessage: (chatId: string, messageId: string) => void;
  readonly respondWith: (chatId: string, contents: readonly string[], selected: number) => void;
  readonly setToolCall: (
    chatId: string,
    messageId: string,
    callId: string,
    state: ToolCallState,
  ) => void;
  readonly requestToolCall: (
    chatId: string,
    messageId: string,
    name: string,
  ) => Promise<
    | { readonly ok: true; readonly callIds: readonly string[] }
    | {
        readonly ok: false;
        readonly failure: LlmFailure;
        readonly attempt?: ToolCallAttempt | undefined;
      }
  >;
  readonly restartToolCall: (
    chatId: string,
    messageId: string,
    callId: string,
    args: string,
  ) => void;
}

const PREVIEW_USER_ID = ':preview-user';
const PREVIEW_ASSISTANT_ID = ':preview-assistant';

export const useChatStore = create<ChatState>()((...store) => ({
  chats: {},
  places: {},
  saveStates: {},
  pending: {},
  nearFull: false,
  drafts: {},
  draftImages: {},
  draftDirections: {},
  draftNotes: {},
  loreDrafts: {},
  ...createChatOpenSlice(...store),
  ...createChatDraftSlice(...store),
  ...createChatSendSlice(...store),
  ...createChatMessageSlice(...store),
}));

export function previewSendRequest(
  chatId: string,
  library: LoreLibrary,
  semantic: SemanticHits,
): ChatCompletionRequest | null {
  const state = useChatStore.getState();
  const chat = state.chats[chatId];
  if (chat === undefined) return null;
  const next = previewChatOf(chat, state.drafts[chatId] ?? '', state.draftImages[chatId] ?? []);
  const target = currentLlmTarget();
  const profile = useLlmProfilesStore
    .getState()
    .profiles.find((item) => item.id === target.profileId);
  const materials = sendMaterials(next, profile?.baseUrl ?? '');
  const sources = sourcesOf(next, library, { semantic });
  const drop = planSend({ chat: next, composition: next.prompt, sources }, materials.budget()).drop;
  return requestOf(next, target, sources, { materials, drop });
}

export function refreshLorePreview(chatId: string): void {
  refreshLoreDraft(useChatStore.getState, useChatStore.setState, chatId);
}

function previewChatOf(chat: Chat, text: string, images: readonly string[]): Chat {
  if (isStreaming(chat)) return chat;
  const typed = text.trim().length > 0 || images.length > 0;
  if (typed) {
    const turn = { text, userId: PREVIEW_USER_ID, assistantId: PREVIEW_ASSISTANT_ID, images };
    return appendTurn(chat, turn);
  }
  return { ...chat, messages: [...chat.messages, previewAssistant()] };
}

function previewAssistant(): ChatMessage {
  return {
    id: PREVIEW_ASSISTANT_ID,
    role: 'assistant',
    candidates: [{ content: '', reasoning: '', end: { kind: 'streaming' } }],
    selected: 0,
  };
}
