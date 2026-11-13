import { Toast } from '@base-ui/react/toast';

import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 知らせ（トースト）の出し口と時間。描く側（`Toaster`）とは別ファイルに置く
// （部品以外を一緒に export すると Fast Refresh が状態を保てない）。
// ─────────────────────────────

const base = Toast.createToastManager();

type AddOptions = Parameters<typeof base.add>[0];

/** 回数を持たせる知らせの中身（`toast.data`） */
interface ToastCount {
  readonly count: number;
}

/** 出している知らせの文面 → その id と回数 */
const shown = new Map<string, { readonly id: string; readonly count: number }>();
/** 出し直すために閉じる知らせ（出す側の `onClose` を呼ばない） */
const replacing = new Set<string>();

function messageKey(options: AddOptions): string | null {
  const { title, description, type } = options;
  if (typeof title !== 'string' || (description !== undefined && typeof description !== 'string')) {
    return null;
  }
  return `${type ?? ''}\u0000${title}\u0000${description ?? ''}`;
}

/**
 * 知らせを出す。同じ文面（種類・題・説明が同じ）なら重ねず、出している 1 つを閉じて回数を 1 つ増やし、
 * 末尾に出し直す。閉じる・消すは Base UI のまま（`close()` は全部を閉じる）
 */
function add(options: AddOptions): string {
  const key = messageKey(options);
  if (key === null || options.id !== undefined) return base.add(options);

  const previous = shown.get(key);
  const count = (previous?.count ?? 0) + 1;
  if (previous !== undefined) {
    replacing.add(previous.id);
    base.close(previous.id);
  }
  const id = base.add({
    ...options,
    data: { ...(isRecord(options.data) ? options.data : {}), count } satisfies ToastCount,
    onClose: () => {
      if (replacing.delete(id)) return;
      if (shown.get(key)?.id === id) shown.delete(key);
      options.onClose?.();
    },
  });
  shown.set(key, { id, count });
  return id;
}

/** 知らせの出し口。`<Toaster />` がこれを描く */
export const toastManager: typeof base = { ...base, add };

/**
 * 成功は 10 秒ほどで消す（ms）。失敗は自動では消さず、閉じるまで残す（`0`。WCAG 2.2.1。
 * 読み終える前に消えると、何が起きたかを後から確かめる手段が無い）
 */
export const TOAST_TIMEOUT = { success: 10_000, error: 0 } as const;

/** 失敗を知らせる（閉じるまで残す）。出した知らせの id を返す */
export function toastError(title: string, description?: string): string {
  return toastManager.add({
    title,
    ...(description === undefined ? {} : { description }),
    type: 'error',
    timeout: TOAST_TIMEOUT.error,
  });
}

/** 成功を知らせる（しばらくして消える）。出した知らせの id を返す */
export function toastSuccess(title: string, description?: string): string {
  return toastManager.add({
    title,
    ...(description === undefined ? {} : { description }),
    type: 'success',
    timeout: TOAST_TIMEOUT.success,
  });
}
