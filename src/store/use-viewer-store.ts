import { create } from 'zustand';

import { isRecord } from '@/lib/guards';
import type { Popup } from '@/lib/popup';
import type { QueueTask } from '@/queue/queue-tasks';
import type { SlideFilter } from '@/queue/viewer-slides';
import { registerTabScoped } from '@/store/kit/tab-scoped';

// ─────────────────────────────
// 結果画像の見せ方（重ねか別窓）。キュー列とタブの中身の両方から開くので、どちらの部品にも属さない
// 状態としてここに置く。
// ─────────────────────────────

/** 見せ方。`overlay` はタブの中身に重ねる、`window` は画面いっぱいの別ウィンドウ */
type ViewerMode = 'closed' | 'overlay' | 'window';

/** 別ウィンドウの名前。同じ名前で開き直すと同じ窓を使い回す */
export const VIEWER_WINDOW = 'kisaraui-image-viewer';

/** 結果画像の見せ方と、見ている画像と、その操作 */
interface ViewerState {
  readonly mode: ViewerMode;
  /** 見ている画像の鍵。null なら先頭 */
  readonly current: string | null;
  /**
   * 開いた窓。別窓で見ているときだけ入る。窓は押した瞬間にしか開けない（副作用へ遅らせるとブラウザに
   * 塞がれる）ので、開く側が `openPopup` を呼び、得た窓をここへ預ける
   */
  readonly popup: Popup | null;
  /** 窓の open がブラウザに塞がれたか */
  readonly blocked: boolean;
  /**
   * 見せる並び。null ならキュー列の並び。履歴のカードから開いたときはその実行の並び
   */
  readonly tasks: readonly QueueTask[] | null;
  /**
   * 並びの持ち主（会話の画像から開いたときは会話の id）。持ち主が並びを取り直す。
   * 無ければ null
   */
  readonly owner: string | null;
  /**
   * 出す画像の種別。**閉じても開き直しても保つ**（この画面が開いている間だけ。保存はしない）
   */
  readonly filter: SlideFilter;
  readonly setFilter: (filter: SlideFilter) => void;
  readonly openOverlay: (
    key: string | null,
    tasks?: readonly QueueTask[] | null,
    owner?: string | null,
  ) => void;
  /** 持ち主が並びを取り直す（見ている画像は変えない。追従はビューワーが決める） */
  readonly setTasks: (tasks: readonly QueueTask[]) => void;
  /** 押した処理の中で開いた窓を預ける。null なら塞がれた */
  readonly openWindow: (popup: Popup | null, key?: string | null) => void;
  readonly setCurrent: (key: string) => void;
  readonly close: () => void;
}

const CLOSED = {
  mode: 'closed' as ViewerMode,
  current: null,
  popup: null,
  blocked: false,
  tasks: null,
  owner: null,
};

export const useViewerStore = create<ViewerState>()((set) => ({
  ...CLOSED,
  filter: 'all',

  setFilter: (filter) => set({ filter }),

  openOverlay: (key, tasks = null, owner = null) =>
    set({ mode: 'overlay', current: key, blocked: false, tasks, owner }),

  setTasks: (tasks) => set({ tasks }),

  openWindow: (popup, key) =>
    set((state) =>
      popup === null
        ? { blocked: true }
        : {
            mode: 'window',
            popup,
            blocked: false,
            current: key === undefined ? state.current : key,
          },
    ),

  setCurrent: (current) => set({ current }),

  // 窓は開いた側の後始末（`use-popup-container`）に任せ、ここでは参照だけ捨てる
  close: () => set(CLOSED),
}));

// 重ねて見ているビューワーはタブのもの。別窓はタブに付かない
registerTabScoped('viewer', {
  capture: () => {
    // 履歴の並びで見ているものはタブに付けない（戻すとキュー列の並びになって位置がずれる）
    const { mode, current, tasks } = useViewerStore.getState();
    return mode === 'overlay' && tasks === null ? { current } : undefined;
  },
  restore: (saved) => {
    const viewer = useViewerStore.getState();
    if (isRecord(saved)) {
      viewer.openOverlay(typeof saved.current === 'string' ? saved.current : null);
    } else if (viewer.mode === 'overlay') {
      viewer.close();
    }
  },
});
