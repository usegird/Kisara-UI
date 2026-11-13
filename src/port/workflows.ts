import type { TemplateSection } from '@/graph/template-filter';

// ─────────────────────────────
// 保存したワークフローとテンプレートの型。
// ─────────────────────────────

/** ユーザーフォルダの `workflows` に保存したワークフローの 1 件 */
export interface SavedWorkflow {
  /** `workflows` からの相対パス。サブフォルダを含むことがある */
  readonly path: string;
  /** 表示用のファイル名（拡張子なし） */
  readonly name: string;
  readonly size: number | null;
  /** 最終更新（epoch ミリ秒）。並べ替えに使う */
  readonly modified: number | null;
}

/**
 * 保存が止まった理由のうち、利用者に選んでもらうもの。
 * `exists` は KisaraUI が作った同名のファイルがある（上書きを確かめる）。
 * `exists-foreign` は KisaraUI が作っていない同名のファイルがある（上書きさせない）。
 * `not-owned` は上書きしようとした先が KisaraUI の作ったファイルでなかった（書いていない）
 */
export type WorkflowSaveFailure = 'exists' | 'exists-foreign' | 'not-owned';

/** 同梱のテンプレートの一覧 */
export interface TemplateIndex {
  readonly sections: TemplateSection[];
  /** 訳を頼んだが取れず、英語の一覧に落としたか */
  readonly fellBack: boolean;
}
