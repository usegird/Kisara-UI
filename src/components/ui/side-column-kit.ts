import type { SideColumnKey } from '@/store/settings-fields/column-widths';

// ─────────────────────────────
// 右の列の中身の渡し方。枠（幅・置き場所・縮める）は共通の部品が持ち、
// 何のタブが並び、それぞれに何を描くかは種別の層（ComfyUI・会話）が渡す。
// ─────────────────────────────

/** 見出しの塗り。失敗は淡い失敗の色、注意は黄色 */
type SideColumnAlert = 'error' | 'warning' | 'none';

/** 右の列のタブ 1 つ */
interface SideColumnSection {
  readonly value: string;
  /** 訳した見出し */
  readonly label: string;
  readonly alert?: SideColumnAlert | undefined;
}

/** 種別の層が右の列の枠へ渡す中身 */
export interface SideColumnKit {
  /** 列の名前（タブの並びと境目の読み上げ） */
  readonly label: string;
  /**
   * 置き場所（右か下）を選べるか。false なら右に固定し、切り替えのアイコンを出さない
   * （会話の右の列）。既定は選べる
   */
  readonly dockable?: boolean | undefined;
  /**
   * 右に置くとき、列の下端を何に揃えるか。既定は本体の列の横に送るバーの上端（10px 空ける）。
   * `input` は会話の入力欄の下（18px 空ける。会話の右の列）
   */
  readonly bottomEdge?: 'scrollbar' | 'input' | undefined;
  /** 幅を持つ鍵。既定は ComfyUI の右の列（`queue`）。会話の右の列は `chatSide` */
  readonly widthKey?: SideColumnKey | undefined;
  /**
   * 置いた列の中身の欄とタブの並びに付ける ref（会話の右の列。画像ビューワーを重ねる範囲を測る）。
   * 縮めて引き出しで出しているときは付けない
   */
  readonly attachPanel?: ((element: HTMLElement | null) => void) | undefined;
  readonly attachTabs?: ((element: HTMLElement | null) => void) | undefined;
  /** タブの並び。列のタブと縮めた行のアイコンで同じ順にする */
  readonly sections: readonly SideColumnSection[];
  readonly selected: string;
  readonly onSelect: (value: string) => void;
  /** 見出しの後ろに添えるもの（進み具合のアイコン・件数） */
  readonly renderTabExtra?: ((value: string) => React.ReactNode) | undefined;
  /** 縮めた行のアイコン（件数を重ねるならここで） */
  readonly renderRailIcon: (value: string) => React.ReactNode;
  /** タブ 1 つの中身。`wrap` は下に置いたとき（横に長い帯） */
  readonly renderContent: (value: string, wrap: boolean) => React.ReactNode;
}
