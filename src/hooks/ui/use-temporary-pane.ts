import { useRef, useState } from 'react';

import { directoryCycle, directoryStateOf } from '@/lib/directory-cycle';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// ダイアログの左の列（フォルダ）の出し方。ピン止めするか、一時的に重ねて出すかを巡らせ、
// 一時的に出した列はその外を押すか Esc で閉じる。モデル選びとストレージの管理で共通に使う。
// ─────────────────────────────

/** 一時的に出す左の列の状態と手続き */
export interface TemporaryPane {
  /** ピン止めしているか（端末に残す） */
  readonly pinned: boolean;
  /** 一時的に重ねて出しているか（開いている間だけ） */
  readonly shown: boolean;
  /** 切り替えのアイコンに渡す今の形 */
  readonly state: 'pinned' | 'shown' | 'hidden';
  /** 一時的に出す → ピン止め → ピン止めをやめる（隠す）と巡る */
  readonly cycle: () => void;
  /** 一時的に出した列を閉じる（選んだとき・開き直したとき） */
  readonly hide: () => void;
  /** 一時的に出した列の囲み。押した所がこの中かを見る */
  readonly overlay: React.RefObject<HTMLDivElement | null>;
  /** 押した所で一時的に出した列を閉じるか（列の中と切り替えのアイコンは閉じない） */
  readonly closesOnPointer: (target: EventTarget) => boolean;
  /** 押したキーで一時的に出した列を閉じるか（出している間の Esc） */
  readonly closesOnKey: (key: string) => boolean;
}

/**
 * 左の列の出し方を持つ。ピン止めは `pinKey` ごとに端末に残し、一時的に出したかは開いている間だけ持つ。
 * @param pinKey - ピン止めを残す名前（呼び出し元ごとに分ける）
 */
export function useTemporaryPane(pinKey: string): TemporaryPane {
  const pinned = useSettingsStore((state) => state.dialogPanePins[pinKey] === true);
  const setPanePin = useSettingsStore((state) => state.setDialogPanePin);
  const [shown, setShown] = useState(false);
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
  };
}
