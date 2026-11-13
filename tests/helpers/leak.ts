// ─────────────────────────────
// 漏れの退行。閉じる・外す前の物を WeakRef で追い、GC を強制してから残った数を数える。
// jsdom に無い仕組み（ResizeObserver・アニメーション・実際の描画）の漏れは捕まえられない。
// ─────────────────────────────

// GC は vite.config.ts の test.execArgv（--expose-gc）で呼べるようにしてある。

export interface LeakWatch {
  /** 追う物を足す（閉じる・外す前に渡す）。追うだけで、残す原因にはならない */
  readonly watch: (target: object) => void;
  /** GC を強制し、まだ残っている数を返す */
  readonly survivors: () => Promise<number>;
}

/** 開け閉めなどを繰り返す回数。漏れていれば、この数だけ残る */
export const LEAK_ROUNDS = 10;

/**
 * 漏れていなくても残ってよい数。最後の数回分は React の控え・テストの手元に残ることがある
 * （DialogFrame で 1〜2 個。待っても増減しない）
 */
export const LEAK_ALLOWANCE = 2;

/** 後始末のタイマー（焦点を戻す等）が済むのを待つ時間（ms） */
const SETTLE_MS = 20;

function isCollector(value: unknown): value is () => void {
  return typeof value === 'function';
}

/** GC を強制する。後始末のタイマーを先に走らせるため、間を空けて 2 回 */
export async function collectGarbage(): Promise<void> {
  const gc: unknown = Reflect.get(globalThis, 'gc');
  if (!isCollector(gc)) {
    throw new Error('GC を呼べません（vite.config.ts の test.execArgv に --expose-gc が要る）');
  }
  for (let round = 0; round < 2; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    gc();
  }
}

export function leakWatch(): LeakWatch {
  const refs: WeakRef<object>[] = [];
  return {
    watch: (target) => {
      refs.push(new WeakRef(target));
    },
    survivors: async () => {
      await collectGarbage();
      return refs.filter((ref) => ref.deref() !== undefined).length;
    },
  };
}
