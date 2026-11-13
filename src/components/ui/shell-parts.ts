import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';

// ─────────────────────────────
// 外枠に種別の層が差し込む部品の形。外枠は欄の並びとアクティブなタブの種別での出し分けだけを持ち、
// 欄の中身・状態・操作は種別の層（ComfyUI・会話）が組む。両方が使うので、ランディングの形と同じくここに置く。
// ─────────────────────────────

/** 種別の層が組むときに外枠から受け取るもの */
export interface ShellContext {
  /** 埋め込み先を測る台帳（会話の画面が登録する） */
  readonly anchors: AnchorRegistry;
  /** ほかの種別が引き受けるファイルを先に試す。引き受けたら true */
  readonly openOther: (file: File) => Promise<boolean>;
}

/** 外枠の欄に差し込む中身。アクティブなときだけ出す欄と、いつも置く欄がある */
export interface ShellParts {
  /** この種別がアクティブなタブの中身を持つか。既定の種別（ほかが持たないタブを持つ）は書かない */
  readonly active?: boolean | undefined;
  /** アクティブなときに右の列の置き場所を決め打つ（無ければ保存した置き場所） */
  readonly dock?: 'right' | undefined;
  /** ヘッダーの左端の、一覧を開け閉めするボタン（アクティブなとき） */
  readonly navToggle: React.ReactNode;
  /** アクティブなタブのメニューに差し込む項目 */
  readonly tabMenu: React.ReactNode;
  /** アクティブなタブの名前を変える */
  readonly onRename: (next: string) => void;
  /** タブの中身（アクティブなとき） */
  readonly workspace: React.ReactNode;
  /** 右の列の中身（アクティブなとき） */
  readonly side: React.ReactNode;
  /** 外枠の上に重ねる物。`overlay` はアクティブなとき、`overlayOnOthers` はほかの種別がアクティブなとき */
  readonly overlay: React.ReactNode;
  readonly overlayOnOthers: React.ReactNode;
  /** いつも置く物。ヘッダーの中・見張り・知らせ・ダイアログ・別窓の順に外枠が並べる */
  readonly header: React.ReactNode;
  readonly background: React.ReactNode;
  readonly toasts: React.ReactNode;
  readonly dialogs: React.ReactNode;
  readonly windows: React.ReactNode;
}

/** 外枠に渡す種別 1 つ */
export interface ShellKind {
  /** 欄の中身を組むフック。外枠が毎回同じ順で呼ぶ */
  readonly useParts: (context: ShellContext) => ShellParts;
  /** 外枠の「ファイルを開く」で、この種別が引き受けるファイルを開く。引き受けたら true */
  readonly openFile?: ((file: File) => Promise<boolean>) | undefined;
}
