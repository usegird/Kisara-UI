import { Toast } from '@base-ui/react/toast';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';

import { toastManager } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 画面上部に短く出す知らせ（トースト）を描く。出し入れ・読み上げ・時間で消すのは Base UI に任せ、
// 出す側は `toastManager.add()` を呼ぶだけで、どこに置かれているかを知らなくてよい。
// ─────────────────────────────

// 色付きの地を少しだけ透かす（白い文字との明度差を保つ濃さ。WCAG 1.4.3）
const toastRoot = cva(
  // 出るとき・消えるときはふわっと変える（動きを減らす設定では変えない）
  `flex items-start gap-2 rounded-lg px-4 py-2.5 text-sm text-white shadow-md backdrop-blur-sm
    transition-opacity duration-300 data-[ending-style]:opacity-0
    data-[starting-style]:opacity-0 motion-reduce:transition-none`,
  {
    variants: {
      type: {
        success: 'bg-toast-success/90',
        error: 'bg-toast-error/90',
      },
    },
  },
);

function typeOf(value: string | undefined): 'success' | 'error' {
  return value === 'error' ? 'error' : 'success';
}

/** 同じ文面を受けた回数（`toastManager` が `data.count` に入れる）。1 回なら出さない */
function countOf(data: unknown): number {
  return isRecord(data) && typeof data.count === 'number' ? data.count : 1;
}

function ToastList(): React.ReactElement {
  const { toasts } = Toast.useToastManager();
  return (
    <>
      {/* Base UI は新しいものを先頭に持つ。古い順に並べ、新しい知らせ（出し直したものも）を末尾に出す */}
      {toasts.toReversed().map((toast) => (
        <Toast.Root
          key={toast.id}
          toast={toast}
          className={toastRoot({ type: typeOf(toast.type) })}
        >
          {/* 文面はドラッグで選んで写せるよう、スワイプで閉じる動きを外す（閉じるのは ×） */}
          <Toast.Content className="min-w-0 cursor-text select-text" data-base-ui-swipe-ignore="">
            <div className="flex items-baseline gap-2">
              <Toast.Title className="font-medium" />
              {countOf(toast.data) > 1 && (
                <span className="shrink-0 rounded-full bg-white/25 px-1.5 text-xs tabular-nums">
                  {t('common.toastCount', { count: String(countOf(toast.data)) })}
                </span>
              )}
            </div>
            <Toast.Description className="mt-0.5 text-xs break-all text-white" />
            {/* 出す側が `actionProps` を渡したときだけ出る（中身が無ければ Base UI が何も描かない） */}
            <Toast.Action className="mt-1 rounded border border-white/60 px-2 py-0.5 text-xs text-white" />
          </Toast.Content>
          <Toast.Close className="-mr-1 rounded p-0.5 text-white" aria-label={t('common.close')}>
            <X className="size-3.5" aria-hidden />
          </Toast.Close>
        </Toast.Root>
      ))}
      {/* 2 つ以上あるときだけ、まとめて閉じる口を末尾に置く */}
      {toasts.length > 1 && (
        <button
          type="button"
          onClick={() => toastManager.close()}
          className="rounded-full bg-black/60 px-3 py-1 text-xs text-white shadow-md"
        >
          {t('common.clearAllToasts')}
        </button>
      )}
    </>
  );
}

/**
 * 隠さずに並べる数の上限。超える前に同じ文面は 1 つにまとまるので、ふつうは届かない
 * （届いたら古いものから Base UI が隠す）
 */
const TOAST_LIMIT = 50;

/** アプリに 1 つだけ置く。知らせは画面上部の中ほどに縦に並べ、入りきらなければ枠の中で送る */
export function Toaster(): React.ReactElement {
  return (
    <Toast.Provider toastManager={toastManager} limit={TOAST_LIMIT}>
      <Toast.Portal>
        <Toast.Viewport
          className="pointer-events-none fixed top-4 left-1/2 z-[60] flex max-h-[calc(100vh-2rem)]
            w-max max-w-[90vw] -translate-x-1/2 flex-col items-center gap-2 overflow-y-auto
            *:pointer-events-auto"
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
