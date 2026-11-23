import { useRef, useState } from 'react';

import { directoryCycle, directoryStateOf } from '@/lib/directory-cycle';
import { useSettingsStore } from '@/store/use-settings-store';

export interface TemporaryPane {
  readonly pinned: boolean;
  readonly shown: boolean;
  readonly state: 'pinned' | 'shown' | 'hidden';
  readonly cycle: () => void;
  readonly hide: () => void;
  readonly overlay: React.RefObject<HTMLDivElement | null>;
  readonly closesOnPointer: (target: EventTarget) => boolean;
  readonly closesOnKey: (key: string) => boolean;
  readonly attachFrame: (element: HTMLElement | null) => (() => void) | undefined;
}

export function useTemporaryPane(pinKey: string, pinFromWidth?: number): TemporaryPane {
  const stored = useSettingsStore((state) => state.dialogPanePins[pinKey]);
  const setPanePin = useSettingsStore((state) => state.setDialogPanePin);
  const [wide, setWide] = useState(false);
  const pinned = stored ?? (pinFromWidth !== undefined && wide);
  const [shown, setShown] = useState(false);
  const attachFrame = (element: HTMLElement | null): (() => void) | undefined => {
    if (element === null || pinFromWidth === undefined) return undefined;
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWide(entry.contentRect.width >= pinFromWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  };
  const overlay = useRef<HTMLDivElement>(null);
  const cycle = (): void => {
    const next = directoryCycle(pinned, shown);
    if (next.pin !== undefined) setPanePin(pinKey, next.pin);
    setShown(next.shown);
  };
  const hide = (): void => setShown(false);
  const closesOnPointer = (target: EventTarget): boolean => {
    if (!shown || !(target instanceof Element)) return false;
    if (overlay.current?.contains(target) === true) return false;
    return target.closest('[data-directory-toggle]') === null;
  };
  const closesOnKey = (key: string): boolean => key === 'Escape' && shown;
  return {
    pinned,
    shown,
    state: directoryStateOf(pinned, shown),
    cycle,
    hide,
    overlay,
    closesOnPointer,
    closesOnKey,
    attachFrame,
  };
}
