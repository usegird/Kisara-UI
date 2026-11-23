import { Toast } from '@base-ui/react/toast';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';

import { toastManager } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { isRecord } from '@/lib/guards';

const toastRoot = cva(
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

function countOf(data: unknown): number {
  return isRecord(data) && typeof data.count === 'number' ? data.count : 1;
}

function ToastList(): React.ReactElement {
  const { toasts } = Toast.useToastManager();
  return (
    <>
      {toasts.toReversed().map((toast) => (
        <Toast.Root
          key={toast.id}
          toast={toast}
          className={toastRoot({ type: typeOf(toast.type) })}
        >
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
            <Toast.Action className="mt-1 rounded border border-white/60 px-2 py-0.5 text-xs text-white" />
          </Toast.Content>
          <Toast.Close className="-mr-1 rounded p-0.5 text-white" aria-label={t('common.close')}>
            <X className="size-3.5" aria-hidden />
          </Toast.Close>
        </Toast.Root>
      ))}
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

const TOAST_LIMIT = 50;

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
