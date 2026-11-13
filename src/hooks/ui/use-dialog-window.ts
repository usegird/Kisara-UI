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

// ─────────────────────────────
// ダイアログ 1 つの出し方・嵌め先・重なり。枠の部品（`DialogFrame` / `DialogWindow`）が使う。
// 並びは `use-dialog-store` が持つ。
// ─────────────────────────────

/** ダイアログ 1 つの出し方の指定 */
interface DialogWindowOptions {
  /** 端末に残す名前。ダイアログごとに 1 つ */
  readonly id: string;
  /** 使う人が切り替えていないときの出し方 */
  readonly defaultMode: DialogMode;
  readonly open: boolean;
  /** 自由移動を持つか。持たなければ常に埋め込み（嵌め先が無いときだけ浮かべる） */
  readonly floatable?: boolean | undefined;
  /** 埋め込みを持つか。持たなければ常に自由移動（確かめるダイアログ） */
  readonly embeddable?: boolean | undefined;
  /** 自由移動の枠の最小の大きさ。無ければ共通の最小（`DIALOG_MIN`） */
  readonly minSize?: DialogMinSize | undefined;
  /**
   * 閉じる手続き。ほかが埋め込みで開いたら呼ばれる。
   * null なら埋め込みの入れ替えに加わらない（確かめるダイアログ。閉じさせず、ほかも閉じない）
   */
  readonly onClose: (() => void) | null;
}

/** 自由移動の前後。焦点を閉じ込めるダイアログ（z-50）より下に収める */
const FLOATING_LAYER_BASE = 40;
const FLOATING_LAYER_MAX = 49;

/** 実際の出し方と、前後・切り替えの手続き */
interface DialogWindow {
  /** 実際の出し方。埋め込みでも嵌め先が無ければ自由移動 */
  readonly mode: DialogMode;
  /** 埋め込みの嵌め先 */
  readonly host: HTMLElement | null;
  /** 埋め込みで、上に別の埋め込みが重なっていないか。自由移動なら常に true */
  readonly visible: boolean;
  /** 自由移動の前後（後から開いた・押したものが前）。埋め込みなら undefined */
  readonly zIndex: number | undefined;
  readonly placement: DialogPlacement;
  readonly toggle: () => void;
  readonly raise: () => void;
}

/**
 * ダイアログ 1 つの出し方を決め、開いている間は重なりの並びに入れる。出し方は使う人が切り替えた
 * もの（端末に残す）を先に、無ければ呼び出す側の既定を使う。嵌め先が無ければ自由移動で出す。
 */
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
  // 並び全体ではなく自分の位置だけを購読する。閉じている間は -1 と false のままなので、
  // ほかのダイアログを開け閉めしても描き直さない（会話の発言ごとに置いた枠が多い）
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

  // 閉じる手続きは最新を呼ぶ（描くたびに作り直されても、並びに入れ直さない）
  const latestClose = useRef(onClose);
  useLayoutEffect(() => {
    latestClose.current = onClose;
  });
  const closable = onClose !== null;
  // 下の effect の依存なので手で固定する（作り直すと並びから外して入れ直し、前後が変わる）
  const close = useCallback(() => latestClose.current?.(), []);

  // 開いている間は並びに入れる（閉じたら外す）。出し方が変わったら一番上へ
  useEffect(() => {
    if (!open) return undefined;
    raiseIn(id, mode, closable ? close : null);
    return () => remove(id);
  }, [open, id, mode, closable, close, raiseIn, remove]);

  const raise = (): void => raiseIn(id, mode);

  const toggle = (): void => {
    const next: DialogMode = mode === 'embedded' ? 'floating' : 'embedded';
    // 初めて自由移動にするときは、埋め込みの枠から少し左下へずらして始める（移ったと分かるように）
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

/** 選ぶ出し方。浮かべられなければ嵌める、嵌められなければ浮かべる。どちらもできれば覚えた出し方 */
function chosenMode(
  can: { readonly floatable: boolean; readonly embeddable: boolean },
  preferred: DialogMode,
): DialogMode {
  if (!can.floatable) return 'embedded';
  if (!can.embeddable) return 'floating';
  return preferred;
}
