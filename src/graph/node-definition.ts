import type {
  InputDefinition,
  NodeDefinition,
  NodeDefinitionMap,
  OutputDefinition,
} from '@/graph/types';
import { t } from '@/i18n';
import { reportFault } from '@/lib/fault';
import { isRecord, isUnknownArray } from '@/lib/guards';

// ─────────────────────────────
// /object_info のレスポンス（未検証の外部入力）を NodeDefinition へ射影する。
// 受け取りは unknown 固定。想定外の形は握り潰さず「そのクラスを落とす」で処理する。
// ─────────────────────────────

/**
 * widget として描画される型。それ以外は入力ソケット扱い
 */
const WIDGET_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO']);

/** 説明は検索の候補に 1 行出すだけなので、先頭だけ残す（長いもので 8 千字ある） */
const DESCRIPTION_LIMIT = 500;

/**
 * 入力仕様は `[type, config?]`。type は文字列のほか、レガシー形式では
 * 選択肢の配列そのものが入る（`[["euler","heun"], {...}]`）。
 */
function parseInputSpec(
  name: string,
  raw: unknown,
  required: boolean,
  dropOptions: boolean,
): InputDefinition | null {
  if (!isUnknownArray(raw) || raw.length === 0) return null;

  const rawType: unknown = raw[0];
  const config = isRecord(raw[1]) ? raw[1] : {};

  let type: string;
  let options: readonly unknown[] | null = null;

  if (isUnknownArray(rawType)) {
    // レガシー COMBO: 選択肢の配列が直接入っている
    type = 'COMBO';
    options = rawType;
  } else if (typeof rawType === 'string') {
    type = rawType;
    if (type === 'COMBO') {
      options = isUnknownArray(config.options) ? config.options : null;
    }
  } else {
    return null;
  }

  const isWidget = WIDGET_TYPES.has(type) && config.forceInput !== true;

  return { name, type, required, isWidget, options: dropOptions ? null : options, config };
}

/**
 * input_order があればそれを正とする（キー順ではない）
 */
function inputNames(order: unknown, specs: Record<string, unknown>): string[] {
  if (isUnknownArray(order)) {
    const ordered = order.filter((n): n is string => typeof n === 'string');
    const known = new Set(ordered);
    // input_order に載っていない入力があっても落とさない
    return [...ordered, ...Object.keys(specs).filter((n) => !known.has(n))];
  }
  return Object.keys(specs);
}

function parseOutputs(entry: Record<string, unknown>): OutputDefinition[] {
  const types = isUnknownArray(entry.output) ? entry.output : [];
  const names = isUnknownArray(entry.output_name) ? entry.output_name : [];

  return types.map((rawType, index) => {
    const type = isUnknownArray(rawType) ? 'COMBO' : String(rawType);
    const rawName: unknown = names[index];
    return { name: typeof rawName === 'string' ? rawName : type, type };
  });
}

/** 射影の選び方 */
interface BuildDefinitionOptions {
  /**
   * COMBO の選択肢を落とす。全体射影ではモデルファイル一覧が容量の 85% を占めるため
   * 既定で落とし、必要になった時点で `/object_info/{class}` から取り直す。
   */
  readonly dropOptions?: boolean;
}

/** 1 クラスの定義を射影する。読めない形なら null */
export function buildNodeDefinition(
  className: string,
  raw: unknown,
  options: BuildDefinitionOptions = {},
): NodeDefinition | null {
  if (!isRecord(raw)) return null;
  const dropOptions = options.dropOptions === true;

  const input = isRecord(raw.input) ? raw.input : {};
  const inputOrder = isRecord(raw.input_order) ? raw.input_order : {};
  const inputs: InputDefinition[] = [];

  for (const group of ['required', 'optional'] as const) {
    const specs = isRecord(input[group]) ? input[group] : {};
    for (const name of inputNames(inputOrder[group], specs)) {
      const parsed = parseInputSpec(name, specs[name], group === 'required', dropOptions);
      if (parsed) inputs.push(parsed);
    }
  }

  // display_name は null のことがある
  const displayName =
    typeof raw.display_name === 'string' && raw.display_name.length > 0
      ? raw.display_name
      : className;

  return {
    name: className,
    displayName,
    category: typeof raw.category === 'string' ? raw.category : '',
    module: typeof raw.python_module === 'string' ? raw.python_module : '',
    inputs,
    outputs: parseOutputs(raw),
    outputNode: raw.output_node === true,
    description:
      typeof raw.description === 'string' ? raw.description.slice(0, DESCRIPTION_LIMIT) : '',
  };
}

/**
 * `/object_info` 全体（クラス名 → 定義）の射影。
 * 選択肢は既定で落とす（20 MB を超える全体が 2 MB ほどになる）。
 */
export function buildNodeDefinitions(
  raw: unknown,
  options: BuildDefinitionOptions = { dropOptions: true },
): NodeDefinitionMap {
  const map = new Map<string, NodeDefinition>();
  if (!isRecord(raw)) return map;
  for (const [className, entry] of Object.entries(raw)) {
    addDefinition(map, className, entry, options);
  }
  return map;
}

/**
 * 小分けにする 1 回のクラス数（200 クラスで約 5ms）
 */
const SLICE_SIZE = 200;

/**
 * `buildNodeDefinitions` と同じ射影を、`SLICE_SIZE` クラスずつに分けて行う。分けた合間に
 * `pause` を待つ（呼び出し側がブラウザへ処理を返す。全体を 1 回で射影すると画面が止まる）
 */
export async function buildNodeDefinitionsInSlices(
  raw: unknown,
  pause: () => Promise<void>,
  options: BuildDefinitionOptions = { dropOptions: true },
): Promise<NodeDefinitionMap> {
  const map = new Map<string, NodeDefinition>();
  if (!isRecord(raw)) return map;
  const entries = Object.entries(raw);
  for (let start = 0; start < entries.length; start += SLICE_SIZE) {
    if (start > 0) await pause();
    for (const [className, entry] of entries.slice(start, start + SLICE_SIZE)) {
      addDefinition(map, className, entry, options);
    }
  }
  return map;
}

/**
 * 1 クラスずつ閉じ込める。読めない定義だけを外し、ほかは使う
 */
function addDefinition(
  map: Map<string, NodeDefinition>,
  className: string,
  entry: unknown,
  options: BuildDefinitionOptions,
): void {
  try {
    const definition = buildNodeDefinition(className, entry, options);
    if (definition) map.set(className, definition);
  } catch (error) {
    reportFault(t('fault.where.nodeDefinition', { name: className }), error);
  }
}

/** COMBO 入力を持つのに選択肢が未取得なら、遅延取得が必要 */
export function needsOptions(definition: NodeDefinition): boolean {
  return definition.inputs.some((input) => input.type === 'COMBO' && input.options === null);
}
