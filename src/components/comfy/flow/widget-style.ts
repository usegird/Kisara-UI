import { cva, type VariantProps } from 'class-variance-authority';

import { field } from '@/components/ui/field';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// パラメータの入力欄の見た目。カードとアプリ入力の列で分ける。条件でクラスを組み立てず、ここに寄せる。
// ─────────────────────────────

const widgetControlVariants = cva('w-full text-xs disabled:opacity-60', {
  variants: {
    appearance: {
      // アプリ入力の列は枠で囲む（幅の掴みが右の枠線に重なる）。カードは縦を詰めるため下線だけ
      box: field(),
      // 線が唯一の手がかりなので、枠の色（border-input）より少し濃くする
      underline: `border-foreground/25 hover:border-foreground/45 focus:border-ring rounded-none
        border-0 border-b bg-transparent px-0.5 py-0.5 focus:outline-none`,
    },
    // 複数行は範囲が分かるよう、下線の見た目でも枠を残す
    multiline: {
      // 高さは掴みで変えてワークフローに残す。ブラウザの掴みは残らないので出さない
      true: 'resize-none font-mono leading-snug',
      false: '',
    },
    // 複数行で、打ちかけが確定していない。確定したら元の枠に戻す
    dirty: {
      true: '',
      false: '',
    },
    muted: {
      true: 'text-muted-foreground',
      false: '',
    },
    // 選択肢に無い値（送ると断られる）。先頭の選択肢に見せかけないため色で示す
    invalid: {
      true: 'text-destructive',
      false: '',
    },
    // 右端に消す × を重ねるぶん、文字が潜らないよう空ける
    clearable: {
      true: 'pr-6',
      false: '',
    },
  },
  compoundVariants: [
    { appearance: 'box', multiline: true, className: 'min-h-12' },
    {
      appearance: 'underline',
      multiline: true,
      className: 'min-h-12 rounded-md border border-input px-1.5 py-1',
    },
    // 枠の指定より後ろに置き、後ろ勝ちで青く太い枠にする（フォーカス中も同じ色）。
    // 焦点の輪は枠に重なって隠すので、打ちかけの間は出さない（枠の色が焦点の代わりになる）
    {
      multiline: true,
      dirty: true,
      className: 'border-edited focus:border-edited border-2 focus:outline-none',
    },
    // 太らせた分だけ内側の余白を詰め、文字の位置を動かさない
    { appearance: 'box', multiline: true, dirty: true, className: 'px-[7px] py-[3px]' },
    { appearance: 'underline', multiline: true, dirty: true, className: 'px-[5px] py-[3px]' },
  ],
  defaultVariants: {
    appearance: 'box',
    multiline: false,
    dirty: false,
    muted: false,
    invalid: false,
    clearable: false,
  },
});

/** 入力欄の見た目の種類（`box` は枠、`underline` は下線だけ） */
export type WidgetAppearance = NonNullable<
  VariantProps<typeof widgetControlVariants>['appearance']
>;

/** 入力欄のクラス。複数行で枠を足すと下線の指定とぶつかるので、後ろ勝ちで整理して返す */
export function widgetControl(
  options: VariantProps<typeof widgetControlVariants>,
  className?: string,
): string {
  return cn(widgetControlVariants(options), className);
}
