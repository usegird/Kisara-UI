import { Dialog } from '@base-ui/react/dialog';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { useCallback, useRef } from 'react';

import {
  DialogChromeContext,
  dialogOpening,
  type DialogChrome,
} from '@/components/ui/dialog-chrome';
import { DIALOG_ICON_CLASS, DIALOG_ZOOM_CLASS, DialogHeader } from '@/components/ui/dialog-header';
import { DialogResizeEdges } from '@/components/ui/dialog-resize-edges';
import { useDialogWindow } from '@/hooks/ui/use-dialog-window';
import { useDialogZoom } from '@/hooks/ui/use-dialog-zoom';
import { t } from '@/i18n';
import type { DialogMinSize, DialogMode } from '@/lib/dialog-rect';
import { cn } from '@/lib/utils';
import { OWN_ZOOM_MARK } from '@/lib/zoom-input';

export { DIALOG_HEADER_CLASS, DIALOG_ICON_CLASS } from '@/components/ui/dialog-header';

// ─────────────────────────────
// 焦点を閉じ込めるダイアログの共通の枠。焦点の閉じ込め・Escape・外側を押して閉じる・読み上げは
// Base UI に任せる。焦点を閉じ込めない画面は `DialogWindow` を使う。
// ─────────────────────────────

/**
 * 枠の置き方と大きさ。`placed` は動かした枠、`embedded` は嵌め先いっぱい
 */
const dialogPopup = cva(
  'bg-popover text-popover-foreground flex flex-col overflow-hidden rounded-lg border shadow-lg',
  {
    variants: {
      size: {
        /** 細い一覧から選ぶもの（ワークフローの追加）。最小の幅を `minSize` で合わせる */
        narrow: 'fixed top-1/2 left-1/2 z-50 w-60 -translate-x-1/2 -translate-y-1/2',
        /** 確かめる・名前を尋ねる程度の小さなもの */
        sm: 'fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2',
        /** 小さなものの 1.5 倍の幅（入力欄とボタンを横に並べる手順。LLM に接続する） */
        smWide: 'fixed top-1/2 left-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2',
        /** smWide の上寄せ（中の注意を開いて背が伸びても頭が動かない。ComfyUI に接続する） */
        smWideTop: 'fixed top-24 left-1/2 z-50 w-full max-w-xl -translate-x-1/2',
        /** 読む文書（smWide の幅で、高さは画面の 8 割まで。越えたら本文を送る） */
        document: `fixed top-1/2 left-1/2 z-50 max-h-[80vh] w-full max-w-xl -translate-x-1/2
          -translate-y-1/2`,
        /** 条文の長い読む文書（利用規約・プライバシーポリシー）。`lg` の幅で、高さは document と同じ */
        documentWide: `fixed top-1/2 left-1/2 z-50 max-h-[80vh] w-full max-w-4xl -translate-x-1/2
          -translate-y-1/2`,
        /** 一覧から選ぶもの。上寄せ（入力しながら候補が伸び縮みしても頭が動かない） */
        md: 'fixed top-24 left-1/2 z-50 max-h-[70vh] w-full max-w-lg -translate-x-1/2',
        /** 検索と一覧を並べるもの。上寄せ */
        lg: 'fixed top-24 left-1/2 z-50 h-[70vh] w-full max-w-4xl -translate-x-1/2',
        /** 画面いっぱいに近いもの（カードの格子・実行の詳細） */
        xl: `fixed top-1/2 left-1/2 z-50 h-[90vh] w-[96vw] max-w-[120rem] -translate-x-1/2
          -translate-y-1/2`,
        placed: 'fixed z-50',
        embedded: 'pointer-events-auto absolute inset-0 z-10',
      },
    },
  },
);

/**
 * 幅 640px 未満で画面いっぱいに出す（読むだけの長い文書）。大きさの指定より後に効く
 */
const dialogNarrow = cva('', {
  variants: {
    fullOnNarrow: {
      false: '',
      true: `max-sm:inset-0 max-sm:h-auto max-sm:max-h-none max-sm:w-auto max-sm:max-w-none
        max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0`,
    },
  },
  defaultVariants: { fullOnNarrow: false },
});

/**
 * 枠の配色。`light` は配色の組に関わらずライトの組で描く（白地の図を出すもの）
 */
const dialogScheme = cva('', {
  variants: { scheme: { auto: '', light: 'theme-light' } },
  defaultVariants: { scheme: 'auto' },
});

/**
 * 暗くする幕。**どちらの出し方でも画面全体を暗くし、外の押下を受ける**（動きを揃える）。
 * 埋め込みは嵌め先の中に置くので、嵌め先の「押下を素通しする」指定を打ち消す
 */
const dialogBackdrop = cva('bg-black/40', {
  variants: {
    mode: {
      floating: 'fixed inset-0 z-50',
      embedded: 'pointer-events-auto fixed inset-0 z-10',
    },
  },
});

/** 見出しの帯の右端の閉じる ×。確認ダイアログでは使わない（やめる・実行で閉じる） */
function DialogCloseIcon(): React.ReactElement {
  return (
    <Dialog.Close
      className={DIALOG_ICON_CLASS}
      aria-label={t('common.close')}
      title={t('common.close')}
    >
      <X className="size-4" aria-hidden />
    </Dialog.Close>
  );
}

/** 動かす前（自由移動）の枠の置き方と大きさの名前 */
type DialogSize =
  'narrow' | 'sm' | 'smWide' | 'smWideTop' | 'document' | 'documentWide' | 'md' | 'lg' | 'xl';

/**
 * 小さいダイアログ。見出しの帯は × だけで、いつも自由移動で出す
 */
const SMALL_SIZES: readonly DialogSize[] = ['narrow', 'sm', 'smWide', 'smWideTop'];

/** 焦点を閉じ込める枠の置き方の入力 */
interface ModalPlacementOptions {
  readonly id: string;
  readonly defaultMode: DialogMode;
  readonly open: boolean;
  readonly size: DialogSize;
  readonly movable: boolean;
  /** 埋め込みを持つか（既定は持つ）。持たなければ常に自由移動で、出し方の切り替えも出さない */
  readonly embeddable?: boolean | undefined;
  /** 自由移動の枠の最小の大きさ。無ければ共通の最小 */
  readonly minSize?: DialogMinSize | undefined;
  /** ほかが埋め込みで開いたときに閉じる手続き。null なら入れ替えに加わらない（確かめるダイアログ） */
  readonly onClose: (() => void) | null;
}

/** 焦点を閉じ込める枠の置き方。基盤の Portal・枠・幕に渡すもの */
interface ModalPlacement {
  /** 基盤の Portal の置き先。自由移動なら既定（文書の末尾） */
  readonly container: HTMLElement | undefined;
  readonly popupClassName: string;
  readonly backdropClassName: string;
  /**
   * 埋め込みか。埋め込みでは基盤が幕の押下を外の押下と見なさないので、呼び出し側が幕で閉じる
   * （自由移動と同じく、外を押したら閉じる）
   */
  readonly embedded: boolean;
  readonly style: React.CSSProperties | undefined;
  readonly popupRef: (element: HTMLDivElement | null) => void;
  readonly chrome: DialogChrome;
  /** 大きさを変える掴み。動かせないときは null */
  readonly edges: React.ReactNode;
  /** 自由移動の前後（後から開いた・押したものが前）。閉じ込めないものだけが使う */
  readonly zIndex: number | undefined;
  /** 一番前へ（押したとき） */
  readonly raise: () => void;
}

/** 焦点を閉じ込める枠の置き方（`DialogFrame` と確認ダイアログで共有） */
export function useModalPlacement({
  id,
  defaultMode,
  open,
  size,
  movable,
  embeddable = true,
  minSize,
  onClose,
}: ModalPlacementOptions): ModalPlacement {
  const { placement, mode, host, toggle, zIndex, raise } = useDialogWindow({
    id,
    defaultMode,
    open,
    embeddable,
    minSize,
    onClose,
  });
  const moving = mode === 'floating' && movable;

  const chrome: DialogChrome = {
    mode,
    onToggleMode: embeddable ? toggle : null,
    move: moving ? placement.move : null,
  };
  return {
    container: mode === 'embedded' ? (host ?? undefined) : undefined,
    popupClassName: cn(
      dialogPopup({
        size: popupSizeOf(mode, moving && placement.placed, size),
      }),
      dialogOpening({ mode }),
    ),
    backdropClassName: dialogBackdrop({ mode }),
    embedded: mode === 'embedded',
    style: moving ? placement.style : undefined,
    popupRef: placement.popupRef,
    chrome,
    edges: moving ? <DialogResizeEdges handlers={placement.resize} /> : null,
    zIndex,
    raise,
  };
}

/** 開いたときに焦点を当てる本体の入力欄（文字を入れるもの。選択欄・チェックは除く） */
const BODY_FIELD_SELECTOR =
  ':scope > :not([data-dialog-header]) :is(input:not([type=hidden], [type=checkbox], ' +
  '[type=radio], [type=range]), textarea)';

/** 枠を開く引き金（Base UI のまま） */
export const DialogTrigger = Dialog.Trigger;
/** 枠を閉じる要素（Base UI のまま） */
export const DialogClose = Dialog.Close;

/** 焦点を閉じ込める枠の props */
export interface DialogFrameProps {
  /** 出し方と枠を端末に残す名前。ダイアログごとに 1 つ */
  readonly id: string;
  /** 使う人が切り替えていないときの出し方。既定は自由移動 */
  readonly defaultMode?: DialogMode | undefined;
  /** 自由移動のとき、帯を掴んで動かし四辺と四隅で大きさを変える */
  readonly movable?: boolean | undefined;
  /**
   * 焦点を閉じ込めて外を触れなくする（既定）。呼び出し側が決める。
   * false なら暗くせず、外を押しても閉じない（外の欄へ差し込む・掴んで落とすため）
   */
  readonly modal?: boolean | undefined;
  /**
   * 埋め込みを持つか。既定は小さいダイアログだけ持たない。嵌める列の無い画面から開くときは
   * false を渡し、出し方の切り替えを出さずいつも自由移動で出す
   */
  readonly embeddable?: boolean | undefined;
  /** 自由移動で大きさを変えるときの最小。無ければ共通の最小（480 × 320） */
  readonly minSize?: DialogMinSize | undefined;
  readonly open: boolean;
  /** 閉じられた（×・Escape・外側）。開くのは呼び出し側（`trigger` を使うときは true も来る） */
  readonly onOpenChange: (open: boolean) => void;
  /** 動かす前（自由移動）の置き方と大きさ */
  readonly size: DialogSize;
  /** 題名。`header` を渡したときは読み上げの名前にだけ使う */
  readonly title: React.ReactNode;
  /** 題名の左に置くもの（前後へ送るボタンなど） */
  readonly leading?: React.ReactNode | undefined;
  /** 題名の右に小さく出す補足 */
  readonly subtitle?: React.ReactNode | undefined;
  /** 本体の先頭に出す説明（小さなダイアログ向け） */
  readonly description?: React.ReactNode | undefined;
  /** 題名の代わりに見出しの帯の左に置くもの（切り替えなど） */
  readonly header?: React.ReactNode | undefined;
  /** 見出しの帯の右寄せ、出し方の切り替えの左に置くもの */
  readonly actions?: React.ReactNode | undefined;
  /**
   * 開いたときに焦点を当てる要素。無ければ**本体の最初の文字の入力欄**（検索・名前など）。
   * それも無ければ基盤の既定（見出しの帯の閉じる × など、最初に焦点が当たるもの）
   */
  readonly initialFocus?: React.RefObject<HTMLElement | null> | undefined;
  /**
   * 閉じたあとに焦点を戻す要素。無ければ基盤の既定（引き金）。
   * 差し込みのように、閉じたら元の入力欄で続けて打たせたいときに渡す
   */
  readonly finalFocus?: React.RefObject<HTMLElement | null> | undefined;
  /** 開く引き金。渡すと枠の外に置かれる（`DialogTrigger` を渡す） */
  readonly trigger?: React.ReactNode | undefined;
  readonly onKeyDown?: React.KeyboardEventHandler<HTMLDivElement> | undefined;
  /** 枠の配色。既定は画面の配色の組に従う */
  readonly scheme?: 'auto' | 'light' | undefined;
  /** 幅 640px 未満で画面いっぱいに出す（読むだけの長い文書）。本体は呼び出し側が縦に送る */
  readonly fullOnNarrow?: boolean | undefined;
  readonly children: React.ReactNode;
}

/**
 * 焦点を閉じ込める枠。出し方は自由移動（既定）と埋め込みで、帯の切り替えで入れ替えて端末に残す
 */
export function DialogFrame({
  id,
  defaultMode = 'floating',
  movable = false,
  modal = true,
  embeddable,
  minSize,
  open,
  onOpenChange,
  size,
  title,
  leading,
  subtitle,
  description,
  header,
  actions,
  initialFocus,
  finalFocus,
  trigger,
  onKeyDown,
  scheme,
  fullOnNarrow,
  children,
}: DialogFrameProps): React.ReactElement {
  const placement = useModalPlacement({
    id,
    defaultMode,
    open,
    size,
    movable,
    // 小さいダイアログは × だけ（出し方の切り替えを持たず、いつも自由移動）
    embeddable: embeddable ?? !SMALL_SIZES.includes(size),
    minSize,
    onClose: () => onOpenChange(false),
  });
  const popup = useRef<HTMLDivElement | null>(null);
  const placementRef = placement.popupRef;
  // 中身の倍率。開いている間だけ持つ
  const { attachZoom, zoom } = useDialogZoom();
  // ref のコールバックなので手で固定する（作り直すと付け外しが起き、倍率の見張りを張り直す）
  const setPopup = useCallback(
    (element: HTMLDivElement | null) => {
      popup.current = element;
      placementRef(element);
      attachZoom(element);
    },
    [placementRef, attachZoom],
  );
  // 見出しの帯を除いた本体から探す（帯の選択欄・× に先に焦点が行かないように）
  const firstField = (): HTMLElement | true =>
    popup.current?.querySelector<HTMLElement>(BODY_FIELD_SELECTOR) ?? true;

  return (
    <Dialog.Root
      open={open}
      modal={modal}
      disablePointerDismissal={!modal}
      onOpenChange={(next) => onOpenChange(next)}
    >
      {trigger}
      <Dialog.Portal container={placement.container}>
        {modal ? (
          <Dialog.Backdrop
            data-dialog-backdrop
            className={placement.backdropClassName}
            // 埋め込みでも外を押したら閉じる（自由移動は基盤が閉じる）
            onClick={placement.embedded ? () => onOpenChange(false) : undefined}
          />
        ) : null}
        <Dialog.Popup
          ref={setPopup}
          className={dialogScheme({
            scheme,
            className: cn(placement.popupClassName, dialogNarrow({ fullOnNarrow })),
          })}
          // 閉じ込めない自由移動は、ほかの自由移動と前後を競う（閉じ込めるものは常に z-50 で上）
          style={
            modal || placement.zIndex === undefined
              ? placement.style
              : { ...placement.style, zIndex: placement.zIndex }
          }
          onPointerDownCapture={modal ? undefined : placement.raise}
          initialFocus={initialFocus ?? firstField}
          finalFocus={finalFocus}
          onKeyDown={onKeyDown}
          {...{ [OWN_ZOOM_MARK]: '' }}
        >
          <DialogChromeContext.Provider value={placement.chrome}>
            {placement.edges}
            {/* 帯と本体に倍率を掛ける（四辺の掴む所は掛けない） */}
            <div className={DIALOG_ZOOM_CLASS} style={{ zoom }}>
              <DialogHeader
                leading={leading}
                heading={
                  header === undefined ? (
                    <Dialog.Title className="min-w-0 truncate text-sm font-semibold">
                      {title}
                    </Dialog.Title>
                  ) : (
                    <>
                      <Dialog.Title className="sr-only">{title}</Dialog.Title>
                      {header}
                    </>
                  )
                }
                subtitle={subtitle}
                actions={actions}
                close={<DialogCloseIcon />}
              />
              {description === undefined ? null : (
                <Dialog.Description className="text-muted-foreground px-4 pt-3 text-xs">
                  {description}
                </Dialog.Description>
              )}
              {children}
            </div>
          </DialogChromeContext.Provider>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** 枠の大きさの出し方。嵌め込みなら列いっぱい、動かした浮き枠ならその大きさ、ほかは種別の大きさ */
function popupSizeOf(
  mode: string,
  placed: boolean,
  size: DialogSize,
): DialogSize | 'embedded' | 'placed' {
  if (mode === 'embedded') return 'embedded';
  return placed ? 'placed' : size;
}
