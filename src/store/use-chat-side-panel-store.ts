import { create } from 'zustand';

// ─────────────────────────────
// 会話の右の列で選んでいるタブ。会話の画面の案内からも切り替えるので、
// 列の中の state ではなくここに置く。端末には残さない。初めはプロンプトのタブ。
// ─────────────────────────────

/** 会話の右の列のタブ */
export type ChatSidePanelTab = 'settings' | 'generation' | 'extension' | 'prompt';

/** 会話の右の列で選んでいるタブと、開く頼み */
interface ChatSidePanelState {
  readonly tab: ChatSidePanelTab;
  readonly setTab: (tab: ChatSidePanelTab) => void;
  /**
   * プロンプトのタブで項目を開く頼み。キャラクターカードを読み込んだ会話は有効な項目を開き、
   * `rows` があればすべて閉じてその行だけを開く（構成の相談の案を反映したとき）。開いたら外す。無ければ null
   */
  readonly expand: ExpandRequest | null;
  readonly requestExpand: (chatId: string, rows?: readonly string[]) => void;
  readonly clearExpand: () => void;
}

/** プロンプトのタブで項目を開く頼み */
interface ExpandRequest {
  readonly chatId: string;
  readonly seq: number;
  /** 開く行（構成の項目の id と、プレフィル・プレイブックの行の印）。無ければ有効な項目 */
  readonly rows?: readonly string[] | undefined;
}

/** 開く頼みの通し番号（同じ会話に読み込み直したときも開き直す） */
let seq = 0;

export const useChatSidePanelStore = create<ChatSidePanelState>()((set) => ({
  tab: 'prompt',
  setTab: (tab) => set({ tab }),
  expand: null,
  requestExpand: (chatId, rows) => set({ expand: { chatId, seq: (seq += 1), rows } }),
  clearExpand: () => set({ expand: null }),
}));
