import { create } from 'zustand';

// ─────────────────────────────
// LLM から受け取った本文の控え（受け取った中身のアイコンで出す）。会話の候補（`responseKey`）
// ごとの最新を持ち、件数で押し出さない。**残さない**（読み込み直すと消える）。記録するのは llm-sent-log.ts
// ─────────────────────────────

/** 2 進の千（文字数の上限の単位） */
const KIBI = 1024;
/** 先頭と末尾に残す文字数（千字） */
const RECEIVED_KEEP_KIBI = 256;

/**
 * これを超えた応答は、先頭と末尾の `RECEIVED_KEEP` だけを残す
 */
export const RECEIVED_LIMIT = KIBI * KIBI;
export const RECEIVED_KEEP = RECEIVED_KEEP_KIBI * KIBI;

/** 受け取った本文の 1 件 */
export interface ReceivedBody {
  readonly id: number;
  /** 受け取り終えた時刻（`Date.now()` の ms） */
  readonly at: number;
  /** 受け取った本文（ストリーミングなら行を改行でつないだもの） */
  readonly text: string;
  /** 間を省いたか */
  readonly truncated: boolean;
}

/** 大きすぎる本文を、先頭と末尾だけにする */
export function keptBody(text: string): { readonly text: string; readonly truncated: boolean } {
  if (text.length <= RECEIVED_LIMIT) return { text, truncated: false };
  return {
    text: `${text.slice(0, RECEIVED_KEEP)}\n…\n${text.slice(-RECEIVED_KEEP)}`,
    truncated: true,
  };
}

interface ReceivedState {
  readonly byKey: Readonly<Record<string, ReceivedBody>>;
  readonly add: (key: string, text: string, at: number) => void;
}

let nextId = 0;

export const useReceivedStore = create<ReceivedState>()((set, get) => ({
  byKey: {},
  add: (key, text, at) => {
    nextId += 1;
    set({ byKey: { ...get().byKey, [key]: { ...keptBody(text), at, id: nextId } } });
  },
}));
