import { create } from 'zustand';

import {
  ADVISOR_USES,
  advisorTargetOf,
  applyProposal,
  type AdvisorGuide,
  type AdvisorProposal,
} from '@/chat/prompt-advisor';
import type { Chat } from '@/chat/types';
import { newShortId } from '@/lib/id';
import {
  dropAdvice,
  sendAdvice,
  sessionGreeting,
  stopAdvice,
  summarizeAdvice,
  type AdvisorSession,
  type SessionPatch,
} from '@/store/chat/advisor-send';
import { useChatSidePanelStore } from '@/store/use-chat-side-panel-store';
import { useChatStore } from '@/store/use-chat-store';

export { formatGreeting, greetingUse } from '@/store/chat/advisor-send';

export function proposalKey(messageId: string, index: number): string {
  return `${messageId}:${String(index)}`;
}

export function sessionIdsOf(
  sessions: Readonly<Record<string, AdvisorSession>>,
  chatId: string,
): string[] {
  return Object.values(sessions)
    .filter((session) => session.chatId === chatId)
    .map((session) => session.id);
}

interface PromptAdvisorState {
  readonly sessions: Readonly<Record<string, AdvisorSession>>;
  readonly start: (chatId: string, guide?: AdvisorGuide) => string;
  readonly setOpen: (id: string, open: boolean) => void;
  readonly end: (id: string) => void;
  readonly setDraft: (id: string, draft: string) => void;
  readonly stepGreeting: (id: string, delta: number) => void;
  readonly send: (id: string, text?: string) => Promise<void>;
  readonly summarize: (id: string) => Promise<void>;
  readonly stop: (id: string) => void;
  readonly apply: (id: string, key: string, proposal: AdvisorProposal) => number;
  readonly revert: (id: string, key: string) => void;
}

export const usePromptAdvisorStore = create<PromptAdvisorState>()((set, get) => {
  const patch: SessionPatch = (id, edit) => {
    const session = get().sessions[id];
    if (session !== undefined) set({ sessions: { ...get().sessions, [id]: edit(session) } });
  };

  return {
    sessions: {},

    start: (chatId, guide) => {
      const kept = Object.values(get().sessions)
        .filter(
          (session) =>
            session.chatId === chatId &&
            (guide !== undefined || session.messages.length === 0) &&
            session.guide?.visible === guide?.visible &&
            session.guide?.guide === guide?.guide,
        )
        .at(-1);
      const id = kept?.id ?? newShortId();
      const created: AdvisorSession = kept ?? newSessionOf(id, chatId, guide);
      set({ sessions: openOnly({ ...get().sessions, [id]: created }, id) });
      return id;
    },

    setOpen: (id, open) => {
      if (open) set({ sessions: openOnly(get().sessions, id) });
      else patch(id, (session) => ({ ...session, isOpen: false }));
    },

    end: (id) => {
      dropAdvice(id);
      const sessions = { ...get().sessions };
      delete sessions[id];
      set({ sessions });
    },

    setDraft: (id, draft) => patch(id, (session) => ({ ...session, draft })),

    stepGreeting: (id, delta) =>
      patch(id, (session) => {
        if (session.messages.length > 0 || session.guide !== undefined) return session;
        const greeting = Math.min(ADVISOR_USES.length - 1, Math.max(0, session.greeting + delta));
        return { ...session, greeting };
      }),

    send: (id, text) => sendAdvice({ get, patch }, id, text),

    summarize: (id) => summarizeAdvice({ get, patch }, id),

    stop: (id) => stopAdvice(id),

    apply: (id, key, proposal) => {
      const session = get().sessions[id];
      const chat =
        session === undefined ? undefined : useChatStore.getState().chats[session.chatId];
      if (session === undefined || chat === undefined) return 0;
      const before = advisorTargetOf(chat);
      const { next, applied, changedRows } = applyProposal(
        before,
        proposal,
        proposalOptionsOf(session, chat),
      );
      if (applied === 0) return 0;
      useChatStore.getState().update(session.chatId, next);
      useChatSidePanelStore.getState().requestExpand(session.chatId, changedRows);
      patch(id, (current) => ({ ...current, applied: { ...current.applied, [key]: before } }));
      return applied;
    },

    revert: (id, key) => {
      const session = get().sessions[id];
      const before = session?.applied[key];
      if (session === undefined || before === undefined) return;
      useChatStore.getState().update(session.chatId, before);
      patch(id, (current) => {
        const applied = { ...current.applied };
        delete applied[key];
        return { ...current, applied };
      });
    },
  };
});

function newSessionOf(id: string, chatId: string, guide: AdvisorGuide | undefined): AdvisorSession {
  return {
    id,
    chatId,
    greeting: 0,
    ...(guide === undefined ? {} : { guide }),
    messages: [],
    summarizing: false,
    isOpen: true,
    streaming: false,
    failure: null,
    draft: '',
    applied: {},
  };
}

function openOnly(
  sessions: Readonly<Record<string, AdvisorSession>>,
  id: string,
): Record<string, AdvisorSession> {
  const chatId = sessions[id]?.chatId;
  return Object.fromEntries(
    Object.values(sessions).map((session) => [
      session.id,
      session.chatId === chatId ? { ...session, isOpen: session.id === id } : session,
    ]),
  );
}

function proposalOptionsOf(
  session: AdvisorSession,
  chat: Chat,
): Parameters<typeof applyProposal>[2] {
  const named = chat.character?.name.trim() ?? '';
  return {
    newId: () => `item-${newShortId()}`,
    lorebookName: named.length > 0 ? named : chat.name,
    use: sessionGreeting(session).use,
    outline: session.guide?.outline ?? null,
    keepSituation: session.guide !== undefined,
  };
}
