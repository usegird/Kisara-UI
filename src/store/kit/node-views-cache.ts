import { buildNodeViews, type BuildNodeViewsOptions, type NodeView } from '@/graph/rows';
import type { NodeDefinitionMap, NodeId, Workflow } from '@/graph/types';
import { reuseEqualItems } from '@/lib/reuse-equal';

// ─────────────────────────────
// カード表示データ（`NodeView`）の控え（購読の入口は `use-node-views`）。組み立ては重い
// （ノード数 × 行数）ので、同じ入力なら作り直さず、中身の変わらないカードと行は前回と同じ物を返す。
// ─────────────────────────────

/** カード表示データの組み立ての条件（控えの鍵にもなる） */
type NodeViewsOptions = Required<BuildNodeViewsOptions> & {
  readonly hiddenCandidates: ReadonlySet<NodeId>;
};

type ByOptions = Map<string, readonly NodeView[]>;
type ByCandidates = WeakMap<ReadonlySet<NodeId>, ByOptions>;

const cache = new WeakMap<Workflow, WeakMap<NodeDefinitionMap, ByCandidates>>();

/** ワークフローごとに渡した並び。閉じたタブのカードを忘れるとき、残すものを引くのに使う */
const produced = new WeakMap<Workflow, Set<readonly NodeView[]>>();

/**
 * 最後に渡したカード（ノード id ごと）。次に渡すとき、中身が同じカードを差し替える。
 * **表示の切り替えをまたいで**持つ（切り替えごとに分けると、切り替えるたびに
 * 前の切り替えで作ったカードへ入れ替わり、全カードが描き直しになる）。
 * 別のワークフローのカードと比べても、中身が同じなら同じものなので差し支えない
 */
const latest = new Map<NodeId, NodeView>();

/** 表示の切り替えごとの、最後に渡した並び */
const shown = new Map<string, readonly NodeView[]>();

/** 中身が同じカード・行を前回渡したものに差し替え、渡したものとして覚える */
function reuseLatest(views: readonly NodeView[]): readonly NodeView[] {
  const previous = views.flatMap((view) => latest.get(view.id) ?? []);
  const next = reuseEqualRows(
    previous,
    reuseEqualItems(previous, views, (view) => view.id),
  );
  for (const view of next) latest.set(view.id, view);
  return next.every((view, index) => view === views[index]) ? views : next;
}

/**
 * 変わったカードの中でも、中身が同じ行は前回の行を使い回す。
 * 並べ替えで番号だけ変わったカードでも、行とアプリ入力の項目を描き直さずに済む
 */
function reuseEqualRows(
  previous: readonly NodeView[] | undefined,
  next: readonly NodeView[],
): readonly NodeView[] {
  if (previous === undefined) return next;
  const before = new Map(previous.map((view) => [view.id, view]));

  return next.map((view) => {
    const old = before.get(view.id);
    if (old === undefined || old === view) return view;
    const rows = reuseEqualItems(old.rows, view.rows, (row) => row.name);
    return rows.every((row, index) => row === view.rows[index]) ? view : { ...view, rows };
  });
}

/** 表示用のカードの並び。同じ入力なら前回の並びを、変わっていてもカード・行は前回のものを返す */
export function cachedNodeViews(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  options: NodeViewsOptions,
): readonly NodeView[] {
  const byDefinitions = cache.get(workflow) ?? new WeakMap<NodeDefinitionMap, ByCandidates>();
  cache.set(workflow, byDefinitions);

  const byCandidates: ByCandidates = byDefinitions.get(definitions) ?? new WeakMap();
  byDefinitions.set(definitions, byCandidates);

  const byOptions: ByOptions =
    byCandidates.get(options.hiddenCandidates) ?? new Map<string, readonly NodeView[]>();
  byCandidates.set(options.hiddenCandidates, byOptions);

  const key = `${String(options.showControlNodes)}:${String(options.showUnlinkedNodes)}`;
  // 覚えていた並びも、ほかの切り替えで新しくなったカードに合わせてから渡す
  const views = reuseLatest(byOptions.get(key) ?? buildNodeViews(workflow, definitions, options));
  // カードが全部前回と同じなら、並びも前回のものを渡す（受け取る側が描き直さないように）
  const last = shown.get(key);
  const result =
    last?.length === views.length && last.every((view, index) => view === views[index])
      ? last
      : views;
  shown.set(key, result);
  byOptions.set(key, result);

  const lists = produced.get(workflow) ?? new Set<readonly NodeView[]>();
  lists.add(result);
  produced.set(workflow, lists);
  return result;
}

/**
 * 残っているワークフローのカードだけを覚えておく（タブを閉じたときに呼ぶ）。
 * 閉じたタブのカードは、id が同じカードに差し替わるまで残り続けるので、ここで忘れる。
 * 残ったタブのカードは触らないので、描き直しは起きない
 */
export function retainNodeViews(live: Iterable<Workflow | null>): void {
  const lists = new Set<readonly NodeView[]>();
  for (const workflow of live) {
    if (workflow === null) continue;
    for (const views of produced.get(workflow) ?? []) lists.add(views);
  }
  const kept = new Set<NodeView>();
  for (const views of lists) for (const view of views) kept.add(view);

  for (const [id, view] of latest) if (!kept.has(view)) latest.delete(id);
  for (const [key, views] of shown) if (!lists.has(views)) shown.delete(key);
}
