import type { ModelDragText } from '@/components/comfy/flow/dialogs/model-picker-rules';
import type { ModelFile } from '@/graph/model-files';

// ─────────────────────────────
// モデルを選ぶダイアログの受け取り物
// ─────────────────────────────

/** 配置の結果。使えなかったら理由（閉じずに出す）、使えたら null（閉じる） */
type PlaceResult = string | null;

/** モデルを選ぶダイアログの props。既定は差し込みのアイコンから開く形 */
export interface ModelPickerDialogProps {
  /** 種別（`loras` / `checkpoints`）。見出しと画像と情報の取り口に使う */
  readonly folder: string;
  /**
   * 出し方・位置・大きさ・列の幅を端末に残す名前。既定は `lora-insert`（差し込み）。
   * 呼び出し元ごとに分けて残す（パラメータ行は `model-picker`）
   */
  readonly dialogId?: string | undefined;
  /** 見出しの補足（パラメータ名など） */
  readonly subtitle: string;
  /**
   * 開く引き金。基盤の引き金（`DialogTrigger`）か、`open` を渡すなら普通のボタン。
   * 見た目は呼び出し元が持つ（パラメータ行は `ModelPickerField`）
   */
  readonly trigger: React.ReactNode;
  /**
   * 焦点を閉じ込めて外を触れなくするか（既定は閉じ込めない）。
   * 閉じ込めないと、開いたまま外の欄を押せ、カードを掴んで落とせる
   */
  readonly modal?: boolean | undefined;
  /**
   * 決定の行き先。`insert` は外の欄へ差し込む（取り込みのアイコン。既定）。情報の名前の左の
   * 取り込みなら閉じずに続けて選べる。`set` はパラメータへ書く（下矢印）。決定はどちらも閉じる
   */
  readonly placeMode?: 'set' | 'insert' | undefined;
  /** 決定を押せない理由（差し込み先が無いなど）。null なら選んでいれば押せる */
  readonly placeBlocked?: string | null | undefined;
  /** 掴んで落とす文字。渡したときだけカードを掴める（閉じ込めないときに使う） */
  readonly drag?: ModelDragText | undefined;
  /**
   * 開け閉てを呼び出し元が持つとき（引き金の押し直しで閉じるなど）。渡さなければ基盤の引き金に任せる
   */
  readonly open?: boolean | undefined;
  /** 開いた・閉じた（呼び出し元が開いている間だけ何かを見張るとき） */
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  /** 閉じたあとに焦点を戻す要素（差し込み先の入力欄） */
  readonly finalFocus?: React.RefObject<HTMLElement | null> | undefined;
  /** 現在の値（選択肢の文字列） */
  readonly value: string;
  readonly options: readonly unknown[];
  readonly index: ReadonlyMap<string, ModelFile>;
  readonly baseUrl: string;
  readonly loading: boolean;
  readonly onRefresh: () => void;
  /**
   * 情報の語・メモを外の欄へ入れる（差し込みの使い方のとき）。渡したときだけ
   * 情報に取り込みのアイコンを出す。押せない理由は `placeBlocked` を使う
   */
  readonly onInsertText?: ((text: string) => void) | undefined;
  /**
   * 決定（ボタン・ダブルクリック・Enter・取り込み）。選んだ値を返す。使い道は呼び出し元が決める。
   * 返すのは選択肢の文字列そのもの（区切り文字が環境で揺れるので、一覧側の表記に置き換えると
   * 実行時に解決できなくなる）
   */
  readonly onPlace: (value: string) => PlaceResult | Promise<PlaceResult>;
}
