import { useEffect, useEffectEvent } from 'react';

import type { Popup } from '@/lib/popup';

// ─────────────────────────────
// 別ウィンドウの後始末（閉じられたことに気づく・親が消えるときに道連れにする）だけを持つ。
// 開くのも中身の準備もクリックの処理の中で行う（`lib/popup.ts`）。
// ─────────────────────────────

/** 閉じられたかを見に行く間隔。閉じる操作に通知が無いので定期的に見る */
const WATCH_MS = 500;

/** 後始末で閉じるのを待っている窓。同じ窓ですぐ張り直されたら取り消す */
const pendingClose = new WeakMap<Window, ReturnType<typeof setTimeout>>();

/** `popup` がある間だけ見張る。閉じられたら `onClosed` を呼ぶ */
export function usePopupContainer(popup: Popup | null, onClosed: () => void): void {
  // 知らせる先は最新の `onClosed`。見張りの依存に入れると、受け口が変わるたびに張り直し、
  // その後始末で窓まで閉じてしまう（呼び出し側が安定した関数を渡すことに頼らない）
  const closed = useEffectEvent(onClosed);

  useEffect(() => {
    if (popup === null) return;

    const view = popup.window;
    // 出し先は窓を預かった時点で現れるので、開発時の StrictMode は置いた直後に後始末と張り直しを続けて走らせる。
    // その後始末が待たせた閉じる処理を、同じ窓の張り直しで取り消す
    const pending = pendingClose.get(view);
    if (pending !== undefined) {
      globalThis.clearTimeout(pending);
      pendingClose.delete(view);
    }
    const closeChild = (): void => view.close();
    const notify = (): void => closed();

    globalThis.addEventListener('beforeunload', closeChild);
    view.addEventListener('beforeunload', notify);

    // ウィンドウ右上の × で閉じられたときも気づけるようにする
    const watch = globalThis.setInterval(() => {
      if (view.closed) notify();
    }, WATCH_MS);

    return () => {
      globalThis.clearInterval(watch);
      globalThis.removeEventListener('beforeunload', closeChild);
      view.removeEventListener('beforeunload', notify);
      // 閉じるのは次の手番まで待つ。張り直されなければ閉じる（待つのは 1 回だけで、繰り返さない）
      const timer = globalThis.setTimeout(() => {
        pendingClose.delete(view);
        view.close();
      }, 0);
      pendingClose.set(view, timer);
    };
  }, [popup]);
}
