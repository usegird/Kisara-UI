import { ownData, ownDataOf, writeOwnData } from '@/graph/own-data';
import type { Workflow } from '@/graph/types';

// ─────────────────────────────
// KisaraUI が作ったワークフローの印（`extra.kisara.created`）。上書きしてよいのは、この印のあるファイルだけ。
// ─────────────────────────────

const CREATED = 'created';

/** KisaraUI が作ったファイルか。形を確かめる前の値（接続先から読んだもの）も受ける */
export function isKisaraCreated(value: unknown): boolean {
  return ownDataOf(value)?.[CREATED] === true;
}

/** ComfyUI へ保存する形。印を付ける */
export function withCreatedMark(workflow: Workflow): Workflow {
  return writeOwnData(workflow, CREATED, true);
}

/**
 * 開くとき用。印を外す。無ければ同じものを返す。
 * 作業中に持つと、実行で画像に埋まり、その画像から本体の画面で作ったファイルにまで印が移る。
 */
export function withoutCreatedMark(workflow: Workflow): Workflow {
  if (ownData(workflow)?.[CREATED] === undefined) return workflow;
  return writeOwnData(workflow, CREATED, undefined);
}
