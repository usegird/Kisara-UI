import { subgraphDefinitions } from '@/graph/normalize';
import { NODE_MODE, type NodeDefinition, type Workflow, type WorkflowNode } from '@/graph/types';
import { isRecord, isUnknownArray } from '@/lib/guards';
import { formatValue } from '@/lib/text';

// ─────────────────────────────
// widgets_values（位置依存配列）と入力名の対応。スロット数が合わないノードは推測で割り当てず
// 「解決不可」として返す（黙って別のパラメータへ値を書く事故を防ぐための安全弁）。
// ─────────────────────────────

/** widgets_values の 1 スロットの種類（値・seed の制御・取り込みの欄） */
type WidgetSlotKind = 'value' | 'control_after_generate' | 'upload';

/** widgets_values の 1 スロット。どの入力に付くか */
interface WidgetSlot {
  readonly input: string;
  readonly kind: WidgetSlotKind;
}

/** 位置の対応が解けたときの、スロットと名前で引ける値 */
interface WidgetValuesResolved {
  readonly ok: true;
  readonly slots: readonly WidgetSlot[];
  /** 入力名 → 値（'value' スロットのみ。control/upload は含めない） */
  readonly byInput: ReadonlyMap<string, unknown>;
  /**
   * widget 名 → 値。ComfyUI 上は `control_after_generate` も独立した widget として
   * 名前を持ち、subgraph の `proxyWidgets` からもその名前で参照される。
   */
  readonly byWidget: ReadonlyMap<string, unknown>;
}

/**
 * 解けなかった理由。数が合わない・名前の写しと並びが食い違う・値の型が入力の型と合わない
 * （数が合っても、入力の並びが変わった版の値をずれたまま当てない）
 */
type WidgetMismatch = 'slot-count-mismatch' | 'named-mismatch' | 'type-mismatch';

/** 位置の対応が解けなかったときの理由と、数えたスロット */
interface WidgetValuesUnresolved {
  readonly ok: false;
  readonly reason: WidgetMismatch;
  readonly expected: number;
  readonly actual: number;
  readonly slots: readonly WidgetSlot[];
}

/** 位置の対応を解いた結果 */
type WidgetValues = WidgetValuesResolved | WidgetValuesUnresolved;

/**
 * 追加スロットの有無。`control_after_generate` は `true` のほかに既定モードを表す
 * 文字列（例: "fixed"）も取る。false / 未指定以外は有効とみなす。
 */
function isEnabled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

/**
 * フロントエンドが名前だけで control_after_generate を足す widget。ComfyUI のフロントエンドは
 * INT で名前が `seed` / `noise_seed` の widget には設定に関係なく足す。`/object_info` 側の宣言は
 * 後から入った仕組みで、宣言していないノードがある（例: `DPRandomGenerator`＝表示名
 * 「Random Prompts」）。宣言だけを見るとスロットが 1 つ足りず、解決不可になる
 */
const SEED_WIDGET_NAMES = new Set(['seed', 'noise_seed']);

function isSeedWidget(input: { readonly name: string; readonly type: string }): boolean {
  return input.type === 'INT' && SEED_WIDGET_NAMES.has(input.name);
}

function buildSlots(definition: NodeDefinition, seedRule: boolean): WidgetSlot[] {
  const slots: WidgetSlot[] = [];

  for (const input of definition.inputs) {
    if (!input.isWidget) continue;

    slots.push({ input: input.name, kind: 'value' });
    if (isEnabled(input.config.control_after_generate) || (seedRule && isSeedWidget(input))) {
      slots.push({ input: input.name, kind: 'control_after_generate' });
    }
    if (isEnabled(input.config.image_upload)) {
      slots.push({ input: input.name, kind: 'upload' });
    }
  }
  return slots;
}

/**
 * 既定のスロット構成。**名前による control_after_generate も込み**で数える
 * （新しくノードを作るときはフロントエンドと同じ並びにしたいため）。
 */
export function widgetSlots(definition: NodeDefinition): WidgetSlot[] {
  return buildSlots(definition, true);
}

/**
 * 読み取り時に試す構成。名前ルールあり／なしの順に試し、**値の個数と一致した方**を採る。
 * 両者は seed widget の数だけ長さが違うので、一致するのは高々1つ。
 */
function slotCandidates(definition: NodeDefinition): WidgetSlot[][] {
  const withSeedRule = buildSlots(definition, true);
  const declaredOnly = buildSlots(definition, false);

  return withSeedRule.length === declaredOnly.length
    ? [withSeedRule]
    : [withSeedRule, declaredOnly];
}

/**
 * widget 値を**位置の並び**として読む。配列でなければ空（名前をキーにしたオブジェクトで
 * 持つカスタムノードがあり、それは位置の対応を取れない。`WorkflowNode.widgets_values` を参照）
 */
export function widgetValueList(node: WorkflowNode): readonly unknown[] {
  return isUnknownArray(node.widgets_values) ? node.widgets_values : [];
}

/**
 * 見せるための widget 値。配列なら名前なし、オブジェクトならキーを名前にして並べる。
 * それ以外の形（null など）は空
 */
export function widgetValueEntries(
  node: WorkflowNode,
): readonly { readonly name: string | null; readonly value: unknown }[] {
  const raw = node.widgets_values;
  if (isUnknownArray(raw)) return raw.map((value) => ({ name: null, value }));
  if (isRecord(raw)) return Object.entries(raw).map(([name, value]) => ({ name, value }));
  return [];
}

/**
 * 位置の対応を解く。**配列でなければ解けない**（読み取り専用にする。書き戻すと形が変わるため）
 */
export function resolveWidgetValues(node: WorkflowNode, definition: NodeDefinition): WidgetValues {
  const values = widgetValueList(node);
  const candidates = slotCandidates(definition);
  const slots = candidates.find((candidate) => candidate.length === values.length);

  if (slots === undefined) {
    const primary = candidates[0] ?? [];
    return {
      ok: false,
      reason: 'slot-count-mismatch',
      expected: primary.length,
      actual: values.length,
      slots: primary,
    };
  }
  const mismatch = namedMismatch(node, slots) ?? typeMismatch(definition, slots, values);
  if (mismatch !== null) {
    return { ok: false, reason: mismatch, expected: slots.length, actual: values.length, slots };
  }

  const byInput = new Map<string, unknown>();
  const byWidget = new Map<string, unknown>();
  slots.forEach((slot, index) => {
    if (slot.kind === 'value') {
      byInput.set(slot.input, values[index]);
      byWidget.set(slot.input, values[index]);
      return;
    }
    if (slot.kind === 'control_after_generate')
      byWidget.set('control_after_generate', values[index]);
  });

  return { ok: true, slots, byInput, byWidget };
}

/**
 * 名前の写し（`widgets_values_named`）があり、数が値と同じなら、その並びの名前と採った位置の
 * 名前を比べる。食い違えば並びが変わった版の値なので解かない。写しが無ければ見ない。
 * **比べるのは値の位置だけ。** 制御・取り込みの欄の名前は画面が決め、定義の設定値
 * （`control_after_generate: "fixed"` なら `fixed`）になることもある
 */
function namedMismatch(node: WorkflowNode, slots: readonly WidgetSlot[]): WidgetMismatch | null {
  const named = node.widgets_values_named;
  if (!isRecord(named)) return null;
  const names = Object.keys(named);
  if (names.length !== slots.length) return null;
  const same = slots.every((slot, at) => slot.kind !== 'value' || names[at] === slot.input);
  return same ? null : 'named-mismatch';
}

/** 入力の型に合う値か。選択肢・知らない型は見ない（モデルが無いだけのことが多い） */
function fitsType(type: string, value: unknown): boolean {
  if (type === 'INT' || type === 'FLOAT') return typeof value === 'number';
  if (type === 'BOOLEAN') return typeof value === 'boolean';
  if (type === 'STRING') return typeof value === 'string';
  return true;
}

/** 値の型が入力の型と合わない位置があれば、ずれた値とみなして解かない */
function typeMismatch(
  definition: NodeDefinition,
  slots: readonly WidgetSlot[],
  values: readonly unknown[],
): WidgetMismatch | null {
  const types = new Map(definition.inputs.map((input) => [input.name, input.type]));
  const fits = slots.every(
    (slot, at) => slot.kind !== 'value' || fitsType(types.get(slot.input) ?? '', values[at]),
  );
  return fits ? null : 'type-mismatch';
}

/**
 * widget 値を1つ書き換えた新しいノードを返す。解決できないノードは null を返し、
 * 呼び出し側で編集を拒否する。
 */
export function writeWidgetValue(
  node: WorkflowNode,
  definition: NodeDefinition,
  inputName: string,
  value: unknown,
): WorkflowNode | null {
  return writeWidgetByName(node, definition, inputName, value);
}

/**
 * widget 名で書き換える。入力名のほか `control_after_generate` のような
 * 独立した widget 名も受け付ける（subgraph の昇格 widget がこの名前で参照する）。
 */
export function writeWidgetByName(
  node: WorkflowNode,
  definition: NodeDefinition,
  widgetName: string,
  value: unknown,
): WorkflowNode | null {
  const resolved = resolveWidgetValues(node, definition);
  if (!resolved.ok) return null;

  const index = resolved.slots.findIndex((slot) =>
    slot.kind === 'control_after_generate'
      ? widgetName === 'control_after_generate'
      : slot.kind === 'value' && slot.input === widgetName,
  );
  if (index < 0) return null;

  const values = [...widgetValueList(node)];
  values[index] = value;

  return { ...node, widgets_values: values, ...namedCopy(node, widgetName, value) };
}

/**
 * 保存・書き出しの前に、名前で引ける値の写しを値の並びに揃える（subgraph の中も）。
 * 本体は写しを並びと同じ順・同じ数で書くので、数が合うノードだけ名前を順に当てはめる。
 * 揃っていれば同じものを返す
 */
export function withNamedCopies(workflow: Workflow): Workflow {
  const nodes = syncedNodes(workflow.nodes);
  let subgraphsChanged = false;
  const subgraphs = subgraphDefinitions(workflow).map((sub) => {
    const inner = syncedNodes(sub.nodes);
    if (inner === null) return sub;
    subgraphsChanged = true;
    return { ...sub, nodes: inner };
  });
  if (nodes === null && !subgraphsChanged) return workflow;
  return {
    ...workflow,
    ...(nodes === null ? {} : { nodes }),
    ...(subgraphsChanged ? { definitions: { ...workflow.definitions, subgraphs } } : {}),
  };
}

/** 写しが並びとずれたノードを揃えた一覧。ずれが無ければ null */
function syncedNodes(nodes: readonly WorkflowNode[]): WorkflowNode[] | null {
  let changed = false;
  const next = nodes.map((node) => {
    const named = node.widgets_values_named;
    const values = node.widgets_values;
    if (!isRecord(named) || !Array.isArray(values)) return node;
    const names = Object.keys(named);
    if (names.length !== values.length) return node;
    if (names.every((name, at) => Object.is(named[name], values[at]))) return node;
    changed = true;
    const synced = Object.fromEntries(
      names.map((name, at): [string, unknown] => [name, values[at]]),
    );
    return { ...node, widgets_values_named: synced };
  });
  return changed ? next : null;
}

/**
 * 名前で引ける値の写し（`widgets_values_named`。新しい本体が書く）を揃える。
 * 本体は開いた直後に写しを今の値で書き直すので、古いままだと開いただけで変更ありになる。
 * 写しが無い・その名前が無ければ触らない（名前は足さない）
 */
function namedCopy(
  node: WorkflowNode,
  widgetName: string,
  value: unknown,
): Pick<WorkflowNode, 'widgets_values_named'> {
  const named = node.widgets_values_named;
  if (!isRecord(named) || !Object.hasOwn(named, widgetName)) return {};
  return { widgets_values_named: { ...named, [widgetName]: value } };
}

/**
 * 設定値1つぶん。
 *   ・`text`  … 1行に詰めるときの素の文字列
 *   ・`label` … ホバー説明用。**数値と真偽にはパラメータ名を付ける**
 *               （`0.6` や `ON` だけでは何の値か分からないため。文字列や選択肢は素のまま）
 */
export interface ValuePart {
  readonly text: string;
  readonly label: string;
  /**
   * バイパスされたノードの値＝**実行では使われない**（入力がそのまま出力へ抜ける）。
   * 表示側で取り消し線にする。
   */
  readonly bypassed: boolean;
}

function labelled(name: string | null, value: unknown, text: string, bypassed: boolean): ValuePart {
  const needsName = name !== null && (typeof value === 'number' || typeof value === 'boolean');

  return { text, label: needsName ? `${name}: ${text}` : text, bypassed };
}

/**
 * ノードの設定値を**1つずつの並び**で返す。**変数の中身の手がかり**として使う。
 * 出力の実体は実行しないと分からないので、静的に分かる入力側の widget 値を並べる。
 * **ここでは切らない・つながない**。1行に詰めるか改行で並べるかは表示側が決める。
 */
export function summarizeValues(
  node: WorkflowNode,
  definition: NodeDefinition | undefined,
): readonly ValuePart[] {
  // 位置対応が解ければ widget 名が付けられる。解けなければ名前なしで値だけ並べる
  const named = definition ? namedWidgets(node, definition) : null;
  const entries = named ?? widgetValueEntries(node);

  // バイパス中のノードの値は実行で使われない（表示側で取り消し線にする）
  const bypassed = node.mode === NODE_MODE.bypass;

  return entries
    .map((entry) => labelled(entry.name, entry.value, formatValue(entry.value), bypassed))
    .filter((part) => part.text.length > 0);
}

/** widget 名と値の組。位置を解決できなければ null */
function namedWidgets(
  node: WorkflowNode,
  definition: NodeDefinition,
): { name: string | null; value: unknown }[] | null {
  const widgets = resolveWidgetValues(node, definition);
  if (!widgets.ok) return null;

  return definition.inputs
    .filter((input) => input.isWidget)
    .map((input) => ({ name: input.name, value: widgets.byInput.get(input.name) }));
}
