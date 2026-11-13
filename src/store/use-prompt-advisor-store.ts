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

// ─────────────────────────────
// 構成の相談（会話ごとに幾つでも。画面の中だけに持ち、残さない）。送る・要約するのは advisor-send.ts。
// 受け取った案は利用者が押したときだけ会話に当てる（当てる直前の値を案ごとに控えて戻せる）。
// ─────────────────────────────

export { formatGreeting, greetingUse } from '@/store/chat/advisor-send';

/** 案の控えの鍵。発言の id と、本文の区切りの中の位置 */
export function proposalKey(messageId: string, index: number): string {
  return `${messageId}:${String(index)}`;
}

/** 会話の相談の id を始めた順に（セレクタから使う。useShallow で受ける） */
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
  /**
   * まだ送っていない相談があれば開き、無ければ新しく始めて開く。開いた相談の id を返す。勘所を渡すと
   * （プレイブックの相談の操作）、同じ勘所の相談が残っていれば送った後でも開き直す（× で終えたものは無い）
   */
  readonly start: (chatId: string, guide?: AdvisorGuide) => string;
  /** 欄を開く・閉じる。開くと同じ会話のほかの相談の欄は閉じる */
  readonly setOpen: (id: string, open: boolean) => void;
  /** 相談を終える（受け取り中・要約している間なら止め、やり取りを捨てる） */
  readonly end: (id: string) => void;
  readonly setDraft: (id: string, draft: string) => void;
  /** 初期メッセージの候補を前後へ送る（送る前だけ） */
  readonly stepGreeting: (id: string, delta: number) => void;
  /**
   * 打ちかけを送る。`text` を渡すとその文を送り、打ちかけは残す（決まったことを入れる）。空・受け取り中・
   * 要約している間は何もしない
   */
  readonly send: (id: string, text?: string) => Promise<void>;
  /**
   * 新しい 4 件の手前までを要約する。縮めるものが無い・受け取り中・要約している間は何もしない
   */
  readonly summarize: (id: string) => Promise<void>;
  /** 受け取り・要約を止める */
  readonly stop: (id: string) => void;
  /** 案を会話に当てる。当てた変える所の件数を返す（会話が無ければ 0） */
  readonly apply: (id: string, key: string, proposal: AdvisorProposal) => number;
  /** 当てる直前の値に戻す */
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
      // プロンプトのタブはすべて閉じ、変えた行だけを開く
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

/** 新しい相談。開いた状態で、まだ何も送っていない */
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

/** その相談だけを開き、同じ会話のほかの欄を閉じる */
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

/** 案を当てるときの決め。個別追加辞書を作るときは、キャラクターの名前（無ければ会話の名前）を付ける */
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
