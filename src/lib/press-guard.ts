// ─────────────────────────────
// 押下の見張り。不意の連打で通信・実行・保存が何度も走らないよう、
// **受け付けてから少しの間だけ、同じ鍵の押下を捨てる。**
// ─────────────────────────────

/** 受け付けてから同じ鍵の押下を捨てる長さ（ms） */
export const PRESS_GUARD_MS = 300;

/**
 * 鍵ごとに最後に受け付けた時刻を持つ見張りを作る（テストで時刻を渡すため外に出す）。
 * 処理の完了は待たない（終わりの知らせが来なくても、時間が過ぎれば必ず受け付ける）。
 * 捨てた押下では間を延ばさない（押し続けても一定の間隔で受け付ける）
 */
export function createPressGuard(
  ms: number = PRESS_GUARD_MS,
): (key: string, now?: number) => boolean {
  const accepted = new Map<string, number>();
  return (key, now = Date.now()) => {
    const last = accepted.get(key);
    if (last !== undefined && now - last < ms && now >= last) return false;
    accepted.set(key, now);
    return true;
  };
}

/** 画面全体で 1 つ。同じ操作の入口が 2 か所にあっても同じ鍵なら一緒に見張る */
const accept = createPressGuard();

/**
 * 押下の処理を包む。間の中の重ね押しは何もしない。
 * 鍵は操作ごと（`run`・`workflow-save` など）。対象があるものは対象の id を添える
 */
export function guardPress<A extends unknown[]>(
  key: string,
  handler: (...args: A) => void,
): (...args: A) => void {
  return (...args) => {
    if (accept(key)) handler(...args);
  };
}
