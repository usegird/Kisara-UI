export interface Edge<K> {
  readonly from: K;
  readonly to: K;
  readonly slot: number;
  readonly use: boolean;
}

const POSITION_SPAN = 10_000;

interface EdgeGraph<K> {
  readonly rank: ReadonlyMap<K, number>;
  readonly consumers: ReadonlyMap<K, Set<K>>;
  readonly producers: ReadonlyMap<K, Set<K>>;
  readonly used: ReadonlyMap<K, Set<K>>;
  readonly slots: ReadonlyMap<K, Map<K, number>>;
  readonly linked: ReadonlySet<K>;
  readonly depths: Map<K, number>;
}

interface PlaceState<K> {
  readonly graph: EdgeGraph<K>;
  readonly ends: readonly K[];
  readonly endSet: ReadonlySet<K>;
  readonly remaining: Set<K>;
  readonly waiting: Map<K, number>;
  readonly closeness: Map<K, number>;
  readonly reversed: K[];
  round: number;
}

interface Batch<K> {
  readonly user: K;
  readonly siblings: K[];
}

export function latestOrder<K>(keys: readonly K[], edges: readonly Edge<K>[]): K[] {
  const graph = edgeGraphOf(keys, edges);

  const linkedKeys = keys.filter((key) => graph.linked.has(key));
  const ends = linkedKeys.filter(
    (key) => (graph.used.get(key)?.size ?? 0) === 0 && (graph.producers.get(key)?.size ?? 0) > 0,
  );
  const endSet = new Set(ends);

  const remaining = new Set(linkedKeys.filter((key) => !endSet.has(key)));
  const state: PlaceState<K> = {
    graph,
    ends,
    endSet,
    remaining,
    waiting: new Map(),
    closeness: new Map(),
    reversed: [],
    round: 0,
  };
  for (const key of remaining) state.waiting.set(key, usersOf(state, key).length);

  while (remaining.size > 0) placeNext(state);

  const placed = new Set(state.reversed);
  const result = [...state.reversed.reverse(), ...linkedKeys.filter((key) => !placed.has(key))];
  pullToUnused(result, edges, (from, to) => slotOf(graph, from, to));
  keys.forEach((key, at) => {
    if (graph.linked.has(key)) return;
    const previous = at > 0 ? keys[at - 1] : undefined;
    result.splice(previous === undefined ? 0 : result.indexOf(previous) + 1, 0, key);
  });
  return result;
}

function edgeGraphOf<K>(keys: readonly K[], edges: readonly Edge<K>[]): EdgeGraph<K> {
  const rank = new Map(keys.map((key, at) => [key, at]));
  const consumers = new Map<K, Set<K>>();
  const producers = new Map<K, Set<K>>();
  const used = new Map<K, Set<K>>();
  const slots = new Map<K, Map<K, number>>();
  for (const { from, to, slot, use } of edges) {
    if (from === to || !rank.has(from) || !rank.has(to)) continue;
    consumers.set(from, (consumers.get(from) ?? new Set()).add(to));
    if (use) used.set(from, (used.get(from) ?? new Set()).add(to));
    producers.set(to, (producers.get(to) ?? new Set()).add(from));
    const bySlot = slots.get(from) ?? new Map<K, number>();
    bySlot.set(to, Math.min(bySlot.get(to) ?? slot, slot));
    slots.set(from, bySlot);
  }
  const linked = new Set([...consumers.keys(), ...producers.keys()]);
  return { rank, consumers, producers, used, slots, linked, depths: new Map() };
}

function placeNext<K>(state: PlaceState<K>): void {
  const later = (a: K, b: K): number => compareLater(state, a, b);
  let ready = [...state.remaining].filter((key) => (state.waiting.get(key) ?? 0) === 0);
  if (ready.length === 0) ready = [[...state.remaining].sort(later)[0] as K];
  const next = ready.sort(later)[0] as K;
  state.round += 1;
  const batch = batchOf(state, next, ready);
  if (batch === null) {
    place(state, next, 0);
    return;
  }

  const { graph } = state;
  const { user, siblings } = batch;
  const byInput = (a: K, b: K): number =>
    slotOf(graph, a, user) - slotOf(graph, b, user) ||
    (graph.rank.get(a) ?? 0) - (graph.rank.get(b) ?? 0);
  const tailed = (key: K): boolean =>
    [...(graph.consumers.get(key) ?? [])].some((to) => to !== user && state.endSet.has(to));
  const forward = [
    ...siblings.filter(tailed).sort(byInput),
    ...siblings.filter((key) => !tailed(key)).sort(byInput),
  ];
  forward.forEach((_, at) => {
    const index = forward.length - 1 - at;
    const key = forward[index];
    if (key !== undefined) place(state, key, index);
  });
}

function batchOf<K>(state: PlaceState<K>, next: K, ready: readonly K[]): Batch<K> | null {
  const { graph } = state;
  const user = nearestUser(state, next);
  if (user !== null) {
    const level = nearOf(state, next);
    return { user, siblings: ready.filter((key) => nearOf(state, key) === level) };
  }
  const end = [...(graph.consumers.get(next) ?? [])].find(
    (to) =>
      state.endSet.has(to) &&
      !state.closeness.has(to) &&
      [...(graph.producers.get(to) ?? [])].every(
        (from) => !state.remaining.has(from) || ready.includes(from),
      ),
  );
  if (end === undefined) return null;
  const siblings = ready.filter(
    (key) => nearOf(state, key) === -1 && (graph.consumers.get(key)?.has(end) ?? false),
  );
  const value = state.round * POSITION_SPAN + siblings.length;
  state.closeness.set(end, value);
  pushEnds(state, end, value);
  state.reversed.push(end);
  return { user: end, siblings };
}

function place<K>(state: PlaceState<K>, key: K, position: number): void {
  const { graph } = state;
  state.remaining.delete(key);
  pushEnds(state, key, state.round * POSITION_SPAN + position);
  state.closeness.set(key, state.round * POSITION_SPAN + position);
  state.reversed.push(key);
  for (const from of graph.producers.get(key) ?? []) {
    if (state.remaining.has(from) && (graph.used.get(from)?.has(key) ?? false)) {
      state.waiting.set(from, (state.waiting.get(from) ?? 0) - 1);
    }
  }
}

function pushEnds<K>(state: PlaceState<K>, key: K, value: number): void {
  for (const end of [...state.ends].reverse()) {
    if (state.closeness.has(end) || !(state.graph.producers.get(end)?.has(key) ?? false)) continue;
    state.closeness.set(end, value);
    pushEnds(state, end, value);
    state.reversed.push(end);
  }
}

function usersOf<K>(state: PlaceState<K>, key: K): K[] {
  return [...(state.graph.used.get(key) ?? [])].filter((to) => !state.endSet.has(to));
}

function nearestUser<K>(state: PlaceState<K>, key: K): K | null {
  let best: K | null = null;
  for (const to of usersOf(state, key)) {
    const value = state.closeness.get(to);
    if (value !== undefined && (best === null || value > (state.closeness.get(best) ?? -1))) {
      best = to;
    }
  }
  return best;
}

function nearOf<K>(state: PlaceState<K>, key: K): number {
  const user = nearestUser(state, key);
  return user === null ? -1 : (state.closeness.get(user) ?? -1);
}

function compareLater<K>(state: PlaceState<K>, a: K, b: K): number {
  const { graph } = state;
  return (
    nearOf(state, b) - nearOf(state, a) ||
    depthOf(graph, a) - depthOf(graph, b) ||
    (graph.rank.get(b) ?? 0) - (graph.rank.get(a) ?? 0)
  );
}

function depthOf<K>(graph: EdgeGraph<K>, key: K, visiting: ReadonlySet<K> = new Set()): number {
  const known = graph.depths.get(key);
  if (known !== undefined) return known;
  const next = new Set(visiting).add(key);
  const sources = [...(graph.producers.get(key) ?? [])].filter((from) => !visiting.has(from));
  const value = Math.max(0, ...sources.map((from) => depthOf(graph, from, next) + 1));
  graph.depths.set(key, value);
  return value;
}

function slotOf<K>(graph: EdgeGraph<K>, from: K, to: K): number {
  return graph.slots.get(from)?.get(to) ?? 0;
}

function pullToUnused<K>(
  order: K[],
  edges: readonly Edge<K>[],
  slotOf: (from: K, to: K) => number,
): void {
  const producers = new Map<K, K[]>();
  for (const { from, to } of edges) {
    if (from !== to) producers.set(to, [...(producers.get(to) ?? []), from]);
  }
  const upstreamOf = (key: K): Set<K> => {
    const found = new Set<K>();
    const stack = [...(producers.get(key) ?? [])];
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      if (found.has(next)) continue;
      found.add(next);
      stack.push(...(producers.get(next) ?? []));
    }
    return found;
  };

  for (const { from, to, use } of edges) {
    if (use || from === to) continue;
    const at = order.indexOf(from);
    const target = order.indexOf(to);
    if (at < 0 || target < 0 || at < target) continue;
    const upstream = upstreamOf(from);
    if (upstream.has(to)) continue;
    const slot = slotOf(from, to);
    const anchor =
      edges
        .filter(
          (edge) =>
            edge.to === to &&
            edge.from !== from &&
            !upstream.has(edge.from) &&
            slotOf(edge.from, to) > slot &&
            order.indexOf(edge.from) >= 0 &&
            order.indexOf(edge.from) < target,
        )
        .map((edge) => edge.from)
        .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? to;
    const anchorAt = order.indexOf(anchor);
    const moving = order.filter(
      (key, index) => key === from || (upstream.has(key) && index > anchorAt),
    );
    const rest = order.filter((key) => !moving.includes(key));
    rest.splice(rest.indexOf(anchor), 0, ...moving);
    order.splice(0, order.length, ...rest);
  }
}
