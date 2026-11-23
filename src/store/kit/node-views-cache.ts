import { buildNodeViews, type BuildNodeViewsOptions, type NodeView } from '@/graph/rows';
import type { NodeDefinitionMap, NodeId, Workflow } from '@/graph/types';
import { reuseEqualItems } from '@/lib/reuse-equal';

type NodeViewsOptions = Required<BuildNodeViewsOptions> & {
  readonly hiddenCandidates: ReadonlySet<NodeId>;
};

type ByOptions = Map<string, readonly NodeView[]>;
type ByCandidates = WeakMap<ReadonlySet<NodeId>, ByOptions>;

const cache = new WeakMap<Workflow, WeakMap<NodeDefinitionMap, ByCandidates>>();

const produced = new WeakMap<Workflow, Set<readonly NodeView[]>>();

const latest = new Map<NodeId, NodeView>();

const shown = new Map<string, readonly NodeView[]>();

function reuseLatest(views: readonly NodeView[]): readonly NodeView[] {
  const previous = views.flatMap((view) => latest.get(view.id) ?? []);
  const next = reuseEqualRows(
    previous,
    reuseEqualItems(previous, views, (view) => view.id),
  );
  for (const view of next) latest.set(view.id, view);
  return next.every((view, index) => view === views[index]) ? views : next;
}

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
  const views = reuseLatest(byOptions.get(key) ?? buildNodeViews(workflow, definitions, options));
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
