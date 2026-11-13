import { MIN_MULTILINE_HEIGHT } from '@/graph/multiline-height';
import { orderedNodeIds } from '@/graph/order';
import { ownData, writeOwnData } from '@/graph/own-data';
import { nodeInputs, type NodeId, type Workflow } from '@/graph/types';
import { clamp } from '@/lib/clamp';
import { isRecord, isUnknownArray } from '@/lib/guards';

// ─────────────────────────────
// App Mode（画面上は「アプリ入力」）の対象パラメータと、その高さ・幅の読み書き。
// 本体の持ち物（`extra.linearData`）に独自キーは足さず、自分が触らない要素は必ず持ち帰る。
// ─────────────────────────────

// 保持場所は ComfyUI 本体と同じ `extra.linearData`:
//   extra.linearData = { inputs: [[nodeId, widgetName, config?], ...], outputs: [nodeId, ...] }
// 幅と入れた値は `extra.kisara` に置く。本体はアプリ入力を選び直すたびに `linearData` を
// 作り直すので、その下には置かない

/** `[nodeId, widgetName, config?]`。id は数値でも文字列でも来るので緩く比較する */
type InputEntry = readonly unknown[];

const LINEAR_DATA = 'linearData';
/** 入力の項目 `[ノード, widget, 設定, ...]` の、設定より後ろが始まる位置 */
const ENTRY_REST_AT = 3;

function linearData(workflow: Workflow): Record<string, unknown> | null {
  const extra = workflow.extra;
  if (!isRecord(extra)) return null;

  const data = extra[LINEAR_DATA];
  return isRecord(data) ? data : null;
}

/** アプリ入力の要素の並び。形の合わない要素は読まない */
export function appInputEntries(workflow: Workflow): InputEntry[] {
  const inputs = linearData(workflow)?.inputs;
  if (!isUnknownArray(inputs)) return [];

  return inputs.filter((entry): entry is InputEntry => isUnknownArray(entry) && entry.length >= 2);
}

/** 要素がそのノードのパラメータを指すか */
export function isSameEntry(entry: InputEntry, nodeId: NodeId, widgetName: string): boolean {
  return String(entry[0]) === String(nodeId) && entry[1] === widgetName;
}

/** そのパラメータがアプリ入力になっているか */
export function isAppInput(workflow: Workflow, nodeId: NodeId, widgetName: string): boolean {
  return appInputEntries(workflow).some((entry) => isSameEntry(entry, nodeId, widgetName));
}

/** ノードごとのアプリ入力の widget 名（表示の絞り込み用） */
export function appInputNames(workflow: Workflow, nodeId: NodeId): Set<string> {
  const names = new Set<string>();
  for (const entry of appInputEntries(workflow)) {
    if (String(entry[0]) !== String(nodeId)) continue;
    if (typeof entry[1] === 'string') names.add(entry[1]);
  }
  return names;
}

/**
 * アプリ入力の項目の指す先を付け替える（グループと subgraph の変換）。
 * `remap` が null を返した項目は外す。3 要素目の設定は持ち帰る。変わらなければ同じものを返す
 */
export function remapAppInputs(
  workflow: Workflow,
  remap: (ref: AppInputRef) => AppInputRef | null,
): Workflow {
  const current = appInputEntries(workflow);
  let changed = false;
  const next: InputEntry[] = [];
  for (const entry of current) {
    const nodeId = Number(entry[0]);
    if (!Number.isFinite(nodeId) || typeof entry[1] !== 'string') {
      next.push(entry);
      continue;
    }
    const to = remap({ nodeId, widgetName: entry[1] });
    if (to === null) {
      changed = true;
      continue;
    }
    if (to.nodeId === nodeId && to.widgetName === entry[1]) {
      next.push(entry);
      continue;
    }
    changed = true;
    next.push([to.nodeId, to.widgetName, ...entry.slice(2)]);
  }
  return changed ? writeAppInputs(workflow, next) : workflow;
}

/** `inputs` を書き戻す。**触っていない要素（3要素目の設定・outputs）は持ち帰る** */
export function writeAppInputs(workflow: Workflow, inputs: readonly InputEntry[]): Workflow {
  const data = linearData(workflow) ?? {};
  const outputs = isUnknownArray(data.outputs) ? data.outputs : [];
  const extra = isRecord(workflow.extra) ? { ...workflow.extra } : {};

  if (inputs.length === 0 && outputs.length === 0) {
    delete extra[LINEAR_DATA];
  } else {
    extra[LINEAR_DATA] = { ...data, inputs, outputs };
  }

  return { ...workflow, extra };
}

/**
 * **カードの通し番号の順の位置**に入れる。通し番号はカードの並び順
 * （横位置の順）で振るので、同じ順で比べる。後ろの番号のカードの項目より前に入り、同じカードの項目の後に続く。
 * 手で並べ替えていて順が崩れていても、最初に見つかった「後ろの番号」の前に入れる。
 */
function insertByCardOrder(
  workflow: Workflow,
  current: readonly InputEntry[],
  added: InputEntry,
): InputEntry[] {
  const rank = new Map(orderedNodeIds(workflow).map((id, index) => [String(id), index]));
  const rankOf = (entry: InputEntry): number =>
    rank.get(String(entry[0])) ?? Number.MAX_SAFE_INTEGER;

  const mine = rankOf(added);
  const at = current.findIndex((entry) => rankOf(entry) > mine);
  return at < 0 ? [...current, added] : [...current.slice(0, at), added, ...current.slice(at)];
}

/**
 * アプリ入力の対象を切り替える。**他の項目・3要素目の設定・outputs は保持する**。
 * 対象が1つも無くなったら `linearData` ごと落として、元のワークフローに近い形へ戻す。
 */
export function toggleAppInput(workflow: Workflow, nodeId: NodeId, widgetName: string): Workflow {
  const current = appInputEntries(workflow);
  const exists = current.some((entry) => isSameEntry(entry, nodeId, widgetName));

  const next = writeAppInputs(
    workflow,
    exists
      ? current.filter((entry) => !isSameEntry(entry, nodeId, widgetName))
      : insertByCardOrder(workflow, current, [nodeId, widgetName]),
  );

  // 外したものの幅は残さない（指す先が無い設定が溜まる）
  return exists ? clearOwn(next, WIDTHS, appInputSpanKey(nodeId, widgetName)) : next;
}

/** まとめてアプリ入力から外す（枠の × ）。幅の指定も消す。外すものが無ければ同じものを返す */
export function removeAppInputs(workflow: Workflow, refs: readonly AppInputRef[]): Workflow {
  let next = workflow;
  for (const ref of refs) {
    if (isAppInput(next, ref.nodeId, ref.widgetName)) {
      next = toggleAppInput(next, ref.nodeId, ref.widgetName);
    }
  }
  return next;
}

/**
 * **結線された入力をアプリ入力から外す**。値は線の先から来るので、
 * アプリ入力に残すと入れる場所の無い欄が残る。幅の指定も一緒に消す。
 * 外すものが無ければ同じものを返す。
 */
export function dropLinkedAppInputs(workflow: Workflow): Workflow {
  let next = workflow;
  for (const entry of appInputEntries(workflow)) {
    const widgetName = entry[1];
    if (typeof widgetName !== 'string') continue;

    const node = workflow.nodes.find((candidate) => String(candidate.id) === String(entry[0]));
    const input = nodeInputs(node).find((candidate) => candidate.name === widgetName);
    if (node && typeof input?.link === 'number') next = toggleAppInput(next, node.id, widgetName);
  }
  return next;
}

// ─────────────────────────────
// 幅（Bootstrap と同じ 12 分割）。全幅のものは書かない（幅を触っていないワークフローに何も足さない）。
// 本体が使う `inputs` / `outputs` / 3要素目の config には手を入れない。
// ─────────────────────────────

/** 幅の刻み。この数で 1 行を割る（12 なら全幅）。**既定でもある** */
export const APP_INPUT_SPANS = 12;

const WIDTHS = 'widths';
/** 幅を引く鍵。ノード id と入力名の組で 1 項目を指す */
export function appInputSpanKey(nodeId: NodeId, widgetName: string): string {
  return `${nodeId}:${widgetName}`;
}

/** 1〜`APP_INPUT_SPANS` に収める。数でなければ null（＝指定なし） */
function clampSpan(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  return clamp(Math.round(value), 1, APP_INPUT_SPANS);
}

/** 独自の持ち物の 1 項目（幅）を、読めた値だけの表にして返す */
function readOwn(
  workflow: Workflow,
  name: string,
  parse: (value: unknown) => number | null,
): Map<string, number> {
  const values = new Map<string, number>();
  const record = ownData(workflow)?.[name];
  if (!isRecord(record)) return values;

  for (const [key, value] of Object.entries(record)) {
    const parsed = parse(value);
    if (parsed !== null) values.set(key, parsed);
  }
  return values;
}

/** 書いてある幅だけを返す。**載っていない項目は全幅**（`APP_INPUT_SPANS`） */
export function appInputSpans(workflow: Workflow): ReadonlyMap<string, number> {
  return readOwn(workflow, WIDTHS, clampSpan);
}

/**
 * 独自の持ち物の 1 項目を `extra.kisara` へ書き戻す。空になったら項目ごと落とす
 */
export function writeAppOwn(
  workflow: Workflow,
  name: string,
  values: ReadonlyMap<string, unknown>,
): Workflow {
  return writeOwnData(workflow, name, values.size === 0 ? undefined : Object.fromEntries(values));
}

/** 指定を消す（既定に戻す）。持っていなければ同じものを返す */
function clearOwn(workflow: Workflow, name: string, key: string): Workflow {
  const values = readOwn(workflow, name, (value) => (typeof value === 'number' ? value : null));
  if (!values.delete(key)) return workflow;

  return writeAppOwn(workflow, name, values);
}

/** 幅を変える。**全幅に戻すと指定ごと消える**。変わらなければ同じものを返す */
export function setAppInputSpan(
  workflow: Workflow,
  nodeId: NodeId,
  widgetName: string,
  span: number,
): Workflow {
  const next = clampSpan(span);
  if (next === null) return workflow;

  const key = appInputSpanKey(nodeId, widgetName);
  if (next === APP_INPUT_SPANS) return clearOwn(workflow, WIDTHS, key);

  const spans = new Map(appInputSpans(workflow));
  if (spans.get(key) === next) return workflow;

  spans.set(key, next);
  return writeAppOwn(workflow, WIDTHS, spans);
}

// ─────────────────────────────
// 高さ。本体と同じく 3要素目の config の `height`（px）に持ち、カードの高さ（ノードの `size`）とは
// 共用しない。書いていなければ既定の高さ（呼び出し側が決める）。config のほかのキーは持ち帰る。
// ─────────────────────────────

/** 下限より小さければ下限に寄せる。数でなければ null（＝指定なし） */
function clampHeight(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  return Math.max(MIN_MULTILINE_HEIGHT, Math.round(value));
}

/** 書いてある高さだけを返す。鍵は幅と同じ（`appInputSpanKey`） */
export function appInputHeights(workflow: Workflow): ReadonlyMap<string, number> {
  const heights = new Map<string, number>();
  for (const entry of appInputEntries(workflow)) {
    const config = entry[2];
    const height = isRecord(config) ? clampHeight(config.height) : null;
    if (height !== null) heights.set(`${String(entry[0])}:${String(entry[1])}`, height);
  }
  return heights;
}

/** 高さを変える。**config のほかのキーは残す**。変わらなければ同じものを返す */
export function setAppInputHeight(
  workflow: Workflow,
  nodeId: NodeId,
  widgetName: string,
  height: number,
): Workflow {
  const next = clampHeight(height);
  if (next === null) return workflow;

  const current = appInputEntries(workflow);
  const index = current.findIndex((entry) => isSameEntry(entry, nodeId, widgetName));
  const entry = current[index];
  if (!entry) return workflow;

  const config = isRecord(entry[2]) ? entry[2] : {};
  if (config.height === next) return workflow;

  const inputs = [...current];
  inputs[index] = [entry[0], entry[1], { ...config, height: next }, ...entry.slice(ENTRY_REST_AT)];
  return writeAppInputs(workflow, inputs);
}

/** アプリ入力の項目 1 つを指す（ノードと widget 名） */
export interface AppInputRef {
  readonly nodeId: NodeId;
  readonly widgetName: string;
}
