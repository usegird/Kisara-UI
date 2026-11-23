import { Toast } from '@base-ui/react/toast';

import { isRecord } from '@/lib/guards';

const base = Toast.createToastManager();

type AddOptions = Parameters<typeof base.add>[0];

interface ToastCount {
  readonly count: number;
}

const shown = new Map<string, { readonly id: string; readonly count: number }>();
const replacing = new Set<string>();

function messageKey(options: AddOptions): string | null {
  const { title, description, type } = options;
  if (typeof title !== 'string' || (description !== undefined && typeof description !== 'string')) {
    return null;
  }
  return `${type ?? ''}\u0000${title}\u0000${description ?? ''}`;
}

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

export const toastManager: typeof base = { ...base, add };

export const TOAST_TIMEOUT = { success: 10_000, error: 0 } as const;

export function toastError(title: string, description?: string): string {
  return toastManager.add({
    title,
    ...(description === undefined ? {} : { description }),
    type: 'error',
    timeout: TOAST_TIMEOUT.error,
  });
}

export function toastSuccess(title: string, description?: string): string {
  return toastManager.add({
    title,
    ...(description === undefined ? {} : { description }),
    type: 'success',
    timeout: TOAST_TIMEOUT.success,
  });
}
