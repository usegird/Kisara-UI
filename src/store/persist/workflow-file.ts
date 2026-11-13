import {
  savedAppValues,
  withoutSavedAppValues,
  withSavedAppValues,
} from '@/graph/app-input-values';
import { isKisaraCreated, withCreatedMark, withoutCreatedMark } from '@/graph/created-mark';
import { parseWorkflow } from '@/graph/normalize';
import { withLinkExtensionsInOrder } from '@/graph/reroutes';
import type { Workflow } from '@/graph/types';
import { withNamedCopies } from '@/graph/widgets';
import { useAppValuesStore } from '@/store/use-app-values-store';
import { useGraphStore, type SavedOrigin } from '@/store/use-graph-store';

// ─────────────────────────────
// ワークフローのファイルとストアの受け渡し。開く経路（ファイル / ComfyUI / テンプレート /
// 開発用のデータ）と書き出す経路（エクスポート / 保存）は、どれもここを通す。
// ─────────────────────────────

/**
 * 読んだワークフローを**アクティブなタブ**に載せる。保存されていたアプリ入力の値は取り出して
 * ストアへ載せ、ワークフローからは外す（二重に持たない）。
 * ComfyUI から開いたものは保存先（接続先と経路）を渡す。作った印を読んで、上書きしてよいかを
 * 保存先と一緒に覚え、印はワークフローから外す
 */
export function openWorkflow(
  raw: unknown,
  name: string,
  from: Omit<SavedOrigin, 'own'> | null = null,
): void {
  const workflow = parseWorkflow(raw);
  const saved = from === null ? null : { ...from, own: isKisaraCreated(workflow) };
  const working = withoutCreatedMark(withoutSavedAppValues(workflow));
  useGraphStore.getState().loadWorkflow(working, name, saved);
  useAppValuesStore.getState().restore(savedAppValues(workflow));
}

/**
 * ComfyUI が書き出すのと同じ体裁（2スペース）。アプリ入力の値は**このときだけ**
 * `extra.kisara.values` に書く（作業中の正本はアプリ入力の値のストア）。
 * 値の写し（`widgets_values_named`）は並びに揃え、線の親（`extra.linkExtensions`）は線の順に
 * 並べる（本体が開いて書き直す形と違うと、開いただけで変更ありになる）。
 * ComfyUI へ保存するときは `created` を渡し、作った印を付ける（エクスポートには付けない）
 */
export function serializeWorkflow(
  workflow: Workflow,
  options: { readonly created?: boolean } = {},
): string {
  const forComfy = withLinkExtensionsInOrder(withNamedCopies(workflow));
  const saved = withSavedAppValues(forComfy, useAppValuesStore.getState().values);
  return JSON.stringify(options.created === true ? withCreatedMark(saved) : saved, null, 2);
}
