import type { LucideIcon } from 'lucide-react';

// ─────────────────────────────
// ランディングに種別の層が渡す中身の形。頁の枠は外枠が持ち、札・経路・注意の文言は
// 種別の層（ComfyUI・会話）が組む。両方が使うので、右の列の枠と同じくここに置く。
// ─────────────────────────────

/** 接続の経路の図の、ブラウザから先の箱 1 つ */
export interface LandingRoute {
  readonly key: string;
  /** 箱の名前（接続先） */
  readonly name: string;
  /** 線の説明（通り方） */
  readonly via: string;
  /** 箱の中の一言（置かない経路もある） */
  readonly detail?: string;
  /** 箱の頭のアイコン（飾り） */
  readonly icon: LucideIcon;
  /** 置き場。ローカル端末（ブラウザと同じ側。図の下）か、外部のクラウド（図の上）か */
  readonly place: 'local' | 'cloud';
}

/** 種別 1 つの札・経路・セキュリティの注意 */
export interface LandingKind {
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  /** 始めるボタンの文言 */
  readonly start: string;
  readonly routes: readonly LandingRoute[];
  readonly notesHeading: string;
  readonly notes: readonly string[];
}
