import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { useDialogPlacement, type DialogPlacement } from '@/hooks/ui/use-dialog-placement';
import {
  offsetFloatingStart,
  type DialogMinSize,
  type DialogMode,
  type DialogRect,
} from '@/lib/dialog-rect';
import { topEmbedded, useDialogStore } from '@/store/use-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';

interface DialogWindowOptions {
  readonly id: string;
  readonly defaultMode: DialogMode;
  readonly open: boolean;
  readonly floatable?: boolean | undefined;
  readonly embeddable?: boolean | undefined;
  readonly minSize?: DialogMinSize | undefined;
  readonly onClose: (() => void) | null;
}

const FLOATING_LAYER_BASE = 40;
const FLOATING_LAYER_MAX = 48;

export const ABOVE_DIALOG_WINDOWS_LAYER = 49;

interface DialogWindow {
  readonly mode: DialogMode;
  readonly host: HTMLElement | null;
  readonly visible: boolean;
  readonly zIndex: number | undefined;
  readonly placement: DialogPlacement;
  readonly toggle: () => void;
  readonly raise: () => void;
}

export function useDialogWindow({
  id,
  defaultMode,
  open,
  floatable = true,
  embeddable = true,
  minSize,
  onClose,
}: DialogWindowOptions): DialogWindow {
  const layout = useSettingsStore((state) => state.dialogLayouts[id]);
  const setMode = useSettingsStore((state) => state.setDialogMode);
  const setRect = useSettingsStore((state) => state.setDialogRect);
  const host = useDialogStore((state) => state.embedHost);
  const index = useDialogStore((state) => state.order.findIndex((entry) => entry.id === id));
  const top = useDialogStore((state) => topEmbedded(state.order) === id);
  const raiseIn = useDialogStore((state) => state.raise);
  const remove = useDialogStore((state) => state.remove);

  const chosen = chosenMode({ floatable, embeddable }, layout?.mode ?? defaultMode);
  const mode: DialogMode = chosen === 'embedded' && host !== null ? 'embedded' : 'floating';

  const placement = useDialogPlacement(
    layout?.rect ?? null,
    (rect: DialogRect) => setRect(id, rect),
    minSize,
  );

  const latestClose = useRef(onClose);
  useLayoutEffect(() => {
    latestClose.current = onClose;
  });
  const closable = onClose !== null;
  const close = useCallback(() => latestClose.current?.(), []);

  useEffect(() => {
    if (!open) return undefined;
    raiseIn(id, mode, closable ? close : null);
    return () => remove(id);
  }, [open, id, mode, closable, close, raiseIn, remove]);

  const raise = (): void => raiseIn(id, mode);

  const toggle = (): void => {
    const next: DialogMode = mode === 'embedded' ? 'floating' : 'embedded';
    if (next === 'floating' && layout?.rect === undefined) {
      const rect = placement.measure();
      if (rect !== null) setRect(id, offsetFloatingStart(rect));
    }
    setMode(id, next);
  };

  return {
    mode,
    host,
    visible: mode === 'floating' || top,
    zIndex:
      mode === 'floating'
        ? Math.min(FLOATING_LAYER_BASE + Math.max(index, 0), FLOATING_LAYER_MAX)
        : undefined,
    placement,
    toggle,
    raise,
  };
}

function chosenMode(
  can: { readonly floatable: boolean; readonly embeddable: boolean },
  preferred: DialogMode,
): DialogMode {
  if (!can.floatable) return 'embedded';
  if (!can.embeddable) return 'floating';
  return preferred;
}
