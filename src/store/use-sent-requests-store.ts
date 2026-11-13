import { create } from 'zustand';

// ─────────────────────────────
// LLM に送った要求の本文の記録（発言と呼び出しの欄の、送った中身のアイコンで出す）。会話の候補ごとの最新と、
// 作らせた呼び出しごとを持ち、件数で押し出さない。**残さない**。キーと宛先は持たない。
// ─────────────────────────────

/** 送った要求の 1 件 */
export interface SentRequest {
  readonly id: number;
  /** 送った時刻（`Date.now()` の ms） */
  readonly at: number;
  readonly model: string;
  /** 送った本文（`POST /chat/completions` の JSON をそのまま） */
  readonly body: string;
}

/** 作らせた呼び出しの鍵（会話の候補の鍵 `responseKey` と重ならない形） */
export function callRequestKey(chatId: string, callId: string): string {
  return `${chatId}/${callId}/call`;
}

interface SentRequestsState {
  /** 会話の候補（`responseKey`）ごとの最新と、作らせた呼び出し（`callRequestKey`）ごと */
  readonly byKey: Readonly<Record<string, SentRequest>>;
  readonly add: (key: string, request: Omit<SentRequest, 'id'>) => void;
  /**
   * 送ったときの仮の鍵の記録を、決まった鍵へ移す（呼び出しの id は受け取った後に決まる。
   * 1 つの要求から複数の呼び出しが返ることもある）。`to` が空なら消す
   */
  readonly move: (from: string, to: readonly string[]) => void;
}

let nextId = 0;

export const useSentRequestsStore = create<SentRequestsState>()((set, get) => ({
  byKey: {},
  add: (key, request) => {
    nextId += 1;
    set({ byKey: { ...get().byKey, [key]: { ...request, id: nextId } } });
  },
  move: (from, to) => {
    const { [from]: entry, ...rest } = get().byKey;
    if (entry === undefined) return;
    set({ byKey: { ...rest, ...Object.fromEntries(to.map((key) => [key, entry])) } });
  },
}));
