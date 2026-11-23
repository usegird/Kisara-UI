import { useEffect, useEffectEvent } from 'react';

import type { Popup } from '@/lib/popup';

const WATCH_MS = 500;

const pendingClose = new WeakMap<Window, ReturnType<typeof setTimeout>>();

export function usePopupContainer(popup: Popup | null, onClosed: () => void): void {
  const closed = useEffectEvent(onClosed);

  useEffect(() => {
    if (popup === null) return;

    const view = popup.window;
    const pending = pendingClose.get(view);
    if (pending !== undefined) {
      globalThis.clearTimeout(pending);
      pendingClose.delete(view);
    }
    const closeChild = (): void => view.close();
    const notify = (): void => closed();

    globalThis.addEventListener('beforeunload', closeChild);
    view.addEventListener('beforeunload', notify);

    const watch = globalThis.setInterval(() => {
      if (view.closed) notify();
    }, WATCH_MS);

    return () => {
      globalThis.clearInterval(watch);
      globalThis.removeEventListener('beforeunload', closeChild);
      view.removeEventListener('beforeunload', notify);
      const timer = globalThis.setTimeout(() => {
        pendingClose.delete(view);
        view.close();
      }, 0);
      pendingClose.set(view, timer);
    };
  }, [popup]);
}
