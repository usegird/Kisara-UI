import { create } from 'zustand';

import { createConnectDialogFlags, type ConnectDialogFlags } from '@/store/kit/connect-dialog';

// ─────────────────────────────
// 「LLM に接続する」のダイアログを出すか。会話のタブを替えても同じものを見る。
// ─────────────────────────────

export const useLlmConnectDialogStore = create<ConnectDialogFlags>()((set) =>
  createConnectDialogFlags(set),
);
