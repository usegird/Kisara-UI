import { create } from 'zustand';

import type { ApiPromptDiagnostic } from '@/graph/to-api-prompt';
import type { NodeId } from '@/graph/types';
import type { RunRejection } from '@/queue/run-report';

export interface SaveNotice {
  readonly kind: 'restored' | 'parallel';
  readonly tabId: string;
  readonly name: string;
  readonly savedAt: number | null;
  readonly source?: string | undefined;
}

interface RunReportState {
  readonly diagnostics: readonly ApiPromptDiagnostic[];
  readonly rejection: RunRejection | null;
  readonly forbidden: boolean;
  readonly saveNotices: readonly SaveNotice[];
  readonly dismissed: ReadonlySet<string>;

  readonly begin: (diagnostics: readonly ApiPromptDiagnostic[]) => void;
  readonly reject: (rejection: RunRejection) => void;
  readonly forbid: () => void;
  readonly addSaveNotices: (notices: readonly SaveNotice[]) => void;
  readonly dropSaveNotices: (resolved: (notice: SaveNotice) => boolean) => void;
  readonly dismiss: (key: string) => void;
  readonly reveal: RevealRequest | null;
  readonly requestReveal: (cardId: NodeId) => void;
  readonly clearReveal: () => void;
  readonly folderFixes: readonly FolderFixNotice[];
  readonly addFolderFixes: (notices: readonly FolderFixNotice[]) => void;
}

export interface FolderFixNotice {
  readonly tabId: string;
  readonly promptNodeId: string;
  readonly widgetName: string;
  readonly to: string;
}

interface RevealRequest {
  readonly cardId: NodeId;
  readonly seq: number;
}

let revealSeq = 0;

export const useRunReportStore = create<RunReportState>()((set) => ({
  diagnostics: [],
  rejection: null,
  forbidden: false,
  saveNotices: [],
  dismissed: new Set(),

  begin: (diagnostics) =>
    set({ diagnostics, rejection: null, forbidden: false, dismissed: new Set() }),
  reject: (rejection) => set({ rejection }),
  forbid: () => set({ forbidden: true }),
  addSaveNotices: (notices) =>
    set((state) => ({ saveNotices: [...withoutReplaced(state.saveNotices, notices), ...notices] })),
  dropSaveNotices: (resolved) =>
    set((state) =>
      state.saveNotices.some(resolved)
        ? { saveNotices: state.saveNotices.filter((notice) => !resolved(notice)) }
        : state,
    ),
  dismiss: (key) => set((state) => ({ dismissed: new Set([...state.dismissed, key]) })),
  reveal: null,
  requestReveal: (cardId) => set({ reveal: { cardId, seq: (revealSeq += 1) } }),
  clearReveal: () => set({ reveal: null }),
  folderFixes: [],
  addFolderFixes: (notices) =>
    set((state) => ({
      folderFixes: [...withoutSameField(state.folderFixes, notices), ...notices],
    })),
}));

function withoutSameField(
  kept: readonly FolderFixNotice[],
  notices: readonly FolderFixNotice[],
): FolderFixNotice[] {
  const same = (a: FolderFixNotice, b: FolderFixNotice): boolean =>
    a.tabId === b.tabId && a.promptNodeId === b.promptNodeId && a.widgetName === b.widgetName;
  return kept.filter((old) => !notices.some((notice) => same(old, notice)));
}

function withoutReplaced(
  saveNotices: readonly SaveNotice[],
  notices: readonly SaveNotice[],
): SaveNotice[] {
  return saveNotices.filter(
    (kept) => !notices.some((notice) => notice.tabId === kept.tabId && notice.kind === kept.kind),
  );
}
