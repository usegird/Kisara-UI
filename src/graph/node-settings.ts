import { hasFlag, withFlag, type NodeFlag } from '@/graph/node-flags';
import { NODE_MODE, type NodeId, type WorkflowNode } from '@/graph/types';
import { t, type MessageKey } from '@/i18n';
import { scaleHexColor, toHexColor } from '@/lib/color';
import { isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

// ─────────────────────────────
// フロー上のカードに出していないノード設定（大きさ・ピン留め・実行モード・色など）の読み書き。
// すべて ComfyUI 本家が持っている標準キーで、独自キーは足さない。
// ─────────────────────────────

/** カードに出している（＝設定ダイアログでは扱わない）キー */
const SHOWN_IN_CARD = new Set([
  'id',
  'type',
  'pos',
  'size',
  'mode',
  'color',
  'bgcolor',
  'inputs',
  'outputs',
  'widgets_values',
  'title',
]);

/** 詳細設定で入れ外しする `flags` の印 */
const EDITABLE_FLAGS: readonly NodeFlag[] = ['pinned'];

/** size を持たないノードに幅だけ指定されたときの既定の幅と高さ */
const FALLBACK_WIDTH = 240;
const FALLBACK_HEIGHT = 100;

/** 3 分の 2 の分母 */
const THIRDS = 3;

/**
 * カスタムの色の見出しの帯の明るさ（本体の色に対する倍率）。本体の 9 色の組はおおむね
 * 見出しが本体の 2/3（`#533` → `#322`）。本体には自由な色選びが無いので、この割合はこちらの決め事
 */
const CUSTOM_HEADER_RATIO = 2 / THIRDS;

/** 設定ダイアログに出すノードの設定。カードに出さない残りのキーは読み取り専用でそのまま見せる */
interface NodeSettings {
  readonly id: NodeId;
  readonly classType: string;
  /** 位置（`pos`）。取れなければ null */
  readonly x: number | null;
  readonly y: number | null;
  /** size を持たないノードは ComfyUI 側が自動計算するので null */
  readonly width: number | null;
  readonly height: number | null;
  readonly mode: number;
  readonly color: string | null;
  readonly bgcolor: string | null;
  /** ピン留め（`flags.pinned`） */
  readonly pinned: boolean;
  /** カードに出していない残りのキー（読み取り専用） */
  readonly extra: Readonly<Record<string, unknown>>;
}

function sizeOf(node: WorkflowNode): [number | null, number | null] {
  const size = node.size;
  if (!Array.isArray(size)) return [null, null];

  const [width, height] = size;
  return [typeof width === 'number' ? width : null, typeof height === 'number' ? height : null];
}

function posOf(node: WorkflowNode): [number | null, number | null] {
  const pos: unknown = node.pos;
  if (!Array.isArray(pos)) return [null, null];

  const x: unknown = pos[0];
  const y: unknown = pos[1];
  return [typeof x === 'number' ? x : null, typeof y === 'number' ? y : null];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** ノードから設定ダイアログに出す設定を読む */
export function readNodeSettings(node: WorkflowNode): NodeSettings {
  const [width, height] = sizeOf(node);
  const [x, y] = posOf(node);

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (SHOWN_IN_CARD.has(key)) continue;
    setOwn(extra, key, key === 'flags' ? otherFlags(value) : value);
  }
  if (extra.flags === undefined) delete extra.flags;

  return {
    id: node.id,
    classType: node.type,
    x,
    y,
    width,
    height,
    mode: typeof node.mode === 'number' ? node.mode : NODE_MODE.normal,
    color: stringOrNull(node.color),
    bgcolor: stringOrNull(node.bgcolor),
    pinned: hasFlag(node, 'pinned'),
    extra,
  };
}

/** 編集できる印を除いた残りの `flags`。残りが無ければ undefined（読み取り専用の欄に出さない） */
function otherFlags(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const rest = Object.entries(value).filter(([key]) => !EDITABLE_FLAGS.includes(key as NodeFlag));
  return rest.length === 0 ? undefined : Object.fromEntries(rest);
}

/** 設定の書き換え。渡した項目だけを変える */
export interface NodeSettingsPatch {
  /** 位置。片方だけ渡せばもう片方は今のまま（`pos` は落とさない） */
  readonly x?: number;
  readonly y?: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly mode?: number;
  readonly color?: string | null;
  readonly bgcolor?: string | null;
  readonly pinned?: boolean;
}

/** size を持たないノードに幅だけ指定されたときの既定値 */
export const FALLBACK_SIZE: [number, number] = [FALLBACK_WIDTH, FALLBACK_HEIGHT];

/** 設定の書き換えを当てた新しいノード。色を null か空にするとキーごと消す */
export function writeNodeSettings(node: WorkflowNode, patch: NodeSettingsPatch): WorkflowNode {
  const next: WorkflowNode = { ...node };

  if (patch.width !== undefined || patch.height !== undefined) {
    const size = patchedSize(node, patch);
    if (size === null) delete next.size;
    else next.size = size;
  }

  if (patch.x !== undefined || patch.y !== undefined) {
    const [currentX, currentY] = posOf(node);
    next.pos = [patch.x ?? currentX ?? 0, patch.y ?? currentY ?? 0];
  }

  if (patch.mode !== undefined) next.mode = patch.mode;
  writeColors(next, patch);

  return patch.pinned === undefined ? next : withFlag(next, 'pinned', patch.pinned);
}

/** 色を書く。null か空ならキーごと消す */
function writeColors(next: WorkflowNode, patch: NodeSettingsPatch): void {
  for (const key of ['color', 'bgcolor'] as const) {
    const value = patch[key];
    if (value === undefined) continue;

    if (value === null || value.length === 0) delete next[key];
    else setOwn(next, key, value);
  }
}

/** 書き換えた後の `size`。幅も高さも未設定に戻すなら null（キーごと消す） */
function patchedSize(node: WorkflowNode, patch: NodeSettingsPatch): [number, number] | null {
  const [currentWidth, currentHeight] = sizeOf(node);
  // null は「未設定に戻す」の意味なので ?? では拾わない
  const width = patch.width === undefined ? currentWidth : patch.width;
  const height = patch.height === undefined ? currentHeight : patch.height;

  if (width === null && height === null) return null;
  return [width ?? FALLBACK_SIZE[0], height ?? FALLBACK_SIZE[1]];
}

/**
 * グループの既定の色。本体は `color` の無いグループを淡青（色の組の `pale_blue`）で描くので、
 * 無いときはこれで塗る。ワークフローには書かない
 */
export const DEFAULT_GROUP_COLOR = '#3f789e';

/**
 * ノードの色の選択肢。見出しの帯（`color`）と本体（`bgcolor`）の組。
 * `groupcolor` は同じ色をグループの枠に使うときの値（本体の組と同じ）
 */
interface NodeColorOption {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly bgcolor: string;
  readonly groupcolor: string;
}

/** 色の選択肢を作る。名前は読んだときに引く（読み込んだ時点では言語が決まっていない） */
function colorOption(
  key: string,
  labelKey: MessageKey,
  [color, bgcolor, groupcolor]: readonly [string, string, string],
): NodeColorOption {
  return {
    key,
    get label() {
      return t(labelKey);
    },
    color,
    bgcolor,
    groupcolor,
  };
}

/**
 * ComfyUI 本体がノードの色として出すものと同じ値。本体と同じく組で塗る
 */
export const NODE_COLOR_OPTIONS: readonly NodeColorOption[] = [
  colorOption('red', 'graph.color.red', ['#322', '#533', '#A88']),
  colorOption('brown', 'graph.color.brown', ['#332922', '#593930', '#b06634']),
  colorOption('green', 'graph.color.green', ['#232', '#353', '#8A8']),
  colorOption('blue', 'graph.color.blue', ['#223', '#335', '#88A']),
  colorOption('pale_blue', 'graph.color.paleBlue', ['#2a363b', '#3f5159', '#3f789e']),
  colorOption('cyan', 'graph.color.cyan', ['#233', '#355', '#8AA']),
  colorOption('purple', 'graph.color.purple', ['#323', '#535', '#a1309b']),
  colorOption('yellow', 'graph.color.yellow', ['#432', '#653', '#b58b2a']),
  colorOption('black', 'graph.color.black', ['#222', '#000', '#444']),
];

/**
 * 選んだ色（本体に塗る色）から組を作る。読めない色は null
 */
export function customColorPair(
  bgcolor: string,
): { readonly color: string; readonly bgcolor: string } | null {
  const body = toHexColor(bgcolor);
  const header = scaleHexColor(bgcolor, CUSTOM_HEADER_RATIO);
  return body && header ? { color: header, bgcolor: body } : null;
}

/** 今の色がどの組か。組に無ければ `'custom'`、色が無ければ null */
export function nodeColorChoice(color: string | null, bgcolor: string | null): string | null {
  if (color === null && bgcolor === null) return null;
  const found = NODE_COLOR_OPTIONS.find(
    (option) => option.color === color && option.bgcolor === bgcolor,
  );
  return found ? found.key : 'custom';
}
