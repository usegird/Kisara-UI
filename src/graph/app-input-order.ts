import { appInputEntries, isSameEntry, writeAppInputs, type AppInputRef } from '@/graph/app-inputs';
import type { NodeRow, NodeView } from '@/graph/rows';
import type { NodeId, Workflow } from '@/graph/types';

// ─────────────────────────────
// アプリ入力の並び順と、カード単位のまとめ。`extra.linearData.inputs` の配列順がそのまま並び順
// （ComfyUI 本体の App Mode もこの順で縦に並べる）で、順序用の独自キーは足さない。
// ─────────────────────────────

/** アプリ入力を `linearData` の並び順で返す */
export function appInputOrder(workflow: Workflow): AppInputRef[] {
  const refs: AppInputRef[] = [];
  for (const entry of appInputEntries(workflow)) {
    const nodeId = Number(entry[0]);
    if (!Number.isFinite(nodeId) || typeof entry[1] !== 'string') continue;

    refs.push({ nodeId, widgetName: entry[1] });
  }
  return refs;
}

/** 落とした先の見え方と、`from` を抜いた並びでの差し込み位置 */
interface AppInputDrop {
  /** 抜いたあとの並びで、ここへ入れる */
  readonly index: number;
  /** `row`=同じ枠の項目の間 / `group`=別の枠の前後（枠の中へは入れない） */
  readonly scope: 'row' | 'group';
  /** 重ねた項目（`row`）か枠（`group`）の前後どちらに入るか */
  readonly side: 'before' | 'after';
}

/**
 * 並べ替えで重ねた先。`nodeIds` は並び順の各項目のノード id。
 *   同じ枠（同じノードが続く区間）の中 : 重ねた項目の位置へ
 *   別の枠                             : 下へ動かすならその枠の後ろ、上へ動かすなら前
 * **別の枠の中へは差し込まない**（枠が割れて、掴んだ項目が他のカードに入り込んで見える）
 */
export function appInputDrop(nodeIds: readonly number[], from: number, to: number): AppInputDrop {
  const side = to > from ? 'after' : 'before';
  let start = to;
  while (start > 0 && nodeIds[start - 1] === nodeIds[to]) start -= 1;
  let end = to;
  while (end < nodeIds.length - 1 && nodeIds[end + 1] === nodeIds[to]) end += 1;

  if (from >= start && from <= end) return { index: to, scope: 'row', side };
  // 抜くと後ろが 1 つ詰まるので、下へ動かすときは枠の末尾の位置がそのまま「後ろ」になる
  return { index: side === 'after' ? end : start, scope: 'group', side };
}

/** `from` を `to` に重ねて落とす（`appInputDrop`）。どちらか見つからなければ何もしない */
export function moveAppInput(workflow: Workflow, from: AppInputRef, to: AppInputRef): Workflow {
  const current = appInputEntries(workflow);
  const fromIndex = current.findIndex((entry) => isSameEntry(entry, from.nodeId, from.widgetName));
  const toIndex = current.findIndex((entry) => isSameEntry(entry, to.nodeId, to.widgetName));
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return workflow;

  const nodeIds = current.map((entry) => Number(entry[0]));
  return writeAppInputs(workflow, droppedOrder(current, nodeIds, fromIndex, toIndex));
}

/**
 * `from` 番目を `to` 番目に重ねて落としたあとの並び（`appInputDrop`）。`nodeIds` は各項目のノード id。
 * 書き戻しと、掴んでいる間の見せ方で同じものを使う
 */
function droppedOrder<T>(
  items: readonly T[],
  nodeIds: readonly number[],
  from: number,
  to: number,
): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined || from === to) return [...items];
  next.splice(appInputDrop(nodeIds, from, to).index, 0, moved);
  return next;
}

/** アプリ入力の列の枠 1 つ（同じカードの項目が続く区間） */
export interface AppInputGroup {
  /**
   * 同じカードが離れた位置に 2 度出ることがあるので、そのカードの何度目の枠かまで含めて鍵にする。
   * 先頭の項目は鍵にしない（枠の中で並べ替えると鍵が変わり、枠ごと作り直されて焦点が消える）
   */
  readonly key: string;
  readonly nodeId: NodeId;
  /** カードの通番。注記など番号を持たないものは null */
  readonly index: string | null;
  /** コメント（`title`）。無ければノード名 */
  readonly label: string;
  /** コメントそのもの（`title`）。無ければ空。見出しで書き換えるときの元 */
  readonly comment: string;
  readonly rows: readonly NodeRow[];
}

/**
 * アプリ入力にしたパラメータを **`order` の並び**でグループにする。
 * 同じカードが連続する区間をひとまとまりの枠にするので、
 * 並べ替えで別カードを挟んだときは枠が分かれる。
 */
export function appInputGroups(
  views: readonly NodeView[],
  order: readonly AppInputRef[],
): AppInputGroup[] {
  const viewById = new Map(views.map((view) => [view.id, view]));
  const groups: AppInputGroup[] = [];

  for (const ref of order) {
    const view = viewById.get(ref.nodeId);
    const row = view?.rows.find((candidate) => candidate.widgetName === ref.widgetName);
    if (!view || !row) continue;

    const last = groups.at(-1);
    if (last && last.nodeId === view.id) {
      groups[groups.length - 1] = { ...last, rows: [...last.rows, row] };
      continue;
    }

    groups.push({
      key: groupKeyFor(groups, view.id),
      nodeId: view.id,
      index: view.index,
      label: view.comment.length > 0 ? view.comment : view.displayName,
      comment: view.comment,
      rows: [row],
    });
  }
  return groups;
}

/** そのカードの何度目の枠かまで含めた鍵（`AppInputGroup.key`） */
function groupKeyFor(groups: readonly AppInputGroup[], nodeId: NodeId): string {
  const seen = groups.filter((group) => group.nodeId === nodeId).length;
  return `${nodeId}:${String(seen)}`;
}

/**
 * 枠の並びのまま、`from` を `to` に重ねて落としたあとの枠（`droppedOrder`）。
 * 掴んでいる間に、落とす先へ置き直して見せる。どちらか無ければそのまま
 */
export function droppedGroups(
  groups: readonly AppInputGroup[],
  from: AppInputRef,
  to: AppInputRef,
): readonly AppInputGroup[] {
  const items = groups.flatMap((group) => group.rows.map((row) => ({ group, row })));
  const find = (ref: AppInputRef): number =>
    items.findIndex(
      ({ group, row }) => group.nodeId === ref.nodeId && row.widgetName === ref.widgetName,
    );
  const fromIndex = find(from);
  const toIndex = find(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return groups;

  const nodeIds = items.map(({ group }) => group.nodeId);
  const next: AppInputGroup[] = [];
  for (const { group, row } of droppedOrder(items, nodeIds, fromIndex, toIndex)) {
    const last = next.at(-1);
    if (last?.nodeId === group.nodeId) {
      next[next.length - 1] = { ...last, rows: [...last.rows, row] };
      continue;
    }
    next.push({ ...group, key: groupKeyFor(next, group.nodeId), rows: [row] });
  }
  return next;
}

/** 並べ替え用の id（dnd-kit）。他の掴む対象と混ざらないよう接頭辞を付ける */
export function appInputDragId({ nodeId, widgetName }: AppInputRef): string {
  return `app:${nodeId}:${widgetName}`;
}

/** 並べ替えの id（`app:<ノード id>:<widget 名>`）を項目の参照に戻す。読めなければ null */
export function parseAppInputDragId(id: unknown): AppInputRef | null {
  if (typeof id !== 'string' || !id.startsWith('app:')) return null;

  const rest = id.slice('app:'.length);
  const separator = rest.indexOf(':');
  if (separator < 0) return null;

  const nodeId = Number(rest.slice(0, separator));
  const widgetName = rest.slice(separator + 1);
  if (!Number.isFinite(nodeId) || widgetName.length === 0) return null;

  return { nodeId, widgetName };
}
