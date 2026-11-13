import { create } from 'zustand';

import type { ApiPromptDiagnostic } from '@/graph/to-api-prompt';
import type { RunRejection } from '@/queue/run-report';

// ─────────────────────────────
// 最後の実行の報告（投入するまでに分かったもの。実行中の失敗は `use-execution-store`）。実行の操作と
// エラーのタブが別の場所にあるので、ここに置いて両方から読む。端末には残さない。
// ─────────────────────────────

/**
 * 一時保存の注意。`restored` は読み戻したタブの一時保存をほかのブラウザのタブが
 * 書いていた、`parallel` は写しの関係にあるタブがほかのブラウザのタブでも編集されている
 */
export interface SaveNotice {
  readonly kind: 'restored' | 'parallel';
  readonly tabId: string;
  /** そのタブの名前（読み戻した時点） */
  readonly name: string;
  /** 書き換えられた時刻（epoch ミリ秒） */
  readonly savedAt: number | null;
  /** `parallel` で、編集したほかのセッション（それを開くブラウザのタブが無くなったら外す） */
  readonly source?: string | undefined;
}

/** 最後の実行の報告と、一時保存の注意と、その操作 */
interface RunReportState {
  /** 変換時に落とした・解決できなかったもの（実行前の注意） */
  readonly diagnostics: readonly ApiPromptDiagnostic[];
  readonly rejection: RunRejection | null;
  /**
   * ComfyUI が**別オリジンからの実行を拒否**した（HTTP 403）。
   * `--enable-cors-header` を付けずに起動していると、変更系のリクエストがこれで弾かれる。
   */
  readonly forbidden: boolean;
  /**
   * 一時保存の注意。実行しても消さず、解消したと分かったら外す（`dropSaveNotices`。閉じたタブの分は
   * 読む側が外す）
   */
  readonly saveNotices: readonly SaveNotice[];

  /** 新しい実行を始める。前の報告を消し、変換の注意だけを入れる */
  readonly begin: (diagnostics: readonly ApiPromptDiagnostic[]) => void;
  readonly reject: (rejection: RunRejection) => void;
  readonly forbid: () => void;
  /** 足す。同じタブ・同じ種類のものは新しい方に置き換える（同じ注意を重ねない） */
  readonly addSaveNotices: (notices: readonly SaveNotice[]) => void;
  /** 解消した注意を外す。外すものが無ければ変えない */
  readonly dropSaveNotices: (resolved: (notice: SaveNotice) => boolean) => void;
}

export const useRunReportStore = create<RunReportState>()((set) => ({
  diagnostics: [],
  rejection: null,
  forbidden: false,
  saveNotices: [],

  begin: (diagnostics) => set({ diagnostics, rejection: null, forbidden: false }),
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
}));

/** 新しく出す知らせと同じタブ・同じ種類の、前からある知らせを外す */
function withoutReplaced(
  saveNotices: readonly SaveNotice[],
  notices: readonly SaveNotice[],
): SaveNotice[] {
  return saveNotices.filter(
    (kept) => !notices.some((notice) => notice.tabId === kept.tabId && notice.kind === kept.kind),
  );
}
