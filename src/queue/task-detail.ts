import { normalizeModelName } from '@/graph/model-files';
import type { NodeDefinitionMap } from '@/graph/types';
import type { MessageKey } from '@/i18n';
import { isUnknownArray } from '@/lib/guards';
import type { PromptNode } from '@/port/run';
import type { NodeTiming } from '@/queue/execution-state';

// ─────────────────────────────
// 実行内容の要約（タスクの詳細ダイアログ）。ノード名で決め打ちせず、モデルは拡張子、プロンプトは
// 定義の `multiline: true`、ポジ／ネガは入力名から上流をたどる、一般的な手掛かりで判定する。
// ─────────────────────────────

const MODEL_FILE = /\.(safetensors|ckpt|pt|pth|bin|gguf|sft|onnx|vae|clip)$/i;

/**
 * モデルのファイルの値か（拡張子で見分ける。履歴のカードの切れ目でも使う）。定義が引けない
 * ノード（未導入のカスタムノード）も、これだけで拾える
 */
export function isModelFile(value: string): boolean {
  return MODEL_FILE.test(value);
}

/**
 * 条件づけの役割を表す入力名。ComfyUI のサンプラー系が共通で使う。
 * `positive` / `negative` が主で、`positive_1..3` `pos` `neg` のような
 * 番号つき・短縮形もある。**役割を表さない `conditioning` は対象外**。
 *   `positive` 86 / `negative` 82 / `conditioning` 29
 */
const ROLE_PATTERN = {
  positive: /^pos(itive)?(_?\d+)?$/i,
  negative: /^neg(ative)?(_?\d+)?$/i,
} as const;

/** プロンプトの役割（ポジ／ネガ） */
export type PromptRole = keyof typeof ROLE_PATTERN;

const ROLES: readonly PromptRole[] = ['positive', 'negative'];

/** `["12", 0]` の形なら上流ノードの id */
export function linkedNodeId(value: unknown): string | null {
  if (!isUnknownArray(value)) return null;

  const id: unknown = value[0];
  return typeof id === 'string' ? id : typeof id === 'number' ? String(id) : null;
}

/**
 * ノードごとの役割。`positive` / `negative` 入力の上流をさかのぼって印を付ける。
 * 両方から辿れる／どちらからも辿れないノードは分類しない（推測で決めない）。
 */
export function classifyRoles(nodes: ReadonlyMap<string, PromptNode>): Map<string, PromptRole> {
  /** ノード id → 付いた印（複数付いたら曖昧なので落とす） */
  const marks = new Map<string, Set<PromptRole>>();
  const queue = roleSeeds(nodes);

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;

    const current = marks.get(next.id) ?? new Set<PromptRole>();
    if (current.has(next.role)) continue;

    current.add(next.role);
    marks.set(next.id, current);

    // 上流へ伝播させる（`ConditioningCombine` などを経由しても届くように）
    const node = nodes.get(next.id);
    for (const value of Object.values(node?.inputs ?? {})) {
      const upstream = linkedNodeId(value);
      if (upstream !== null) queue.push({ id: upstream, role: next.role });
    }
  }

  const roles = new Map<string, PromptRole>();
  for (const [id, set] of marks) {
    const [only] = [...set];
    if (set.size === 1 && only !== undefined) roles.set(id, only);
  }
  return roles;
}

/** 役割の名前の入力（`positive` / `negative` など）に繋がった上流のノードと、その役割 */
function roleSeeds(
  nodes: ReadonlyMap<string, PromptNode>,
): { readonly id: string; readonly role: PromptRole }[] {
  const seeds: { readonly id: string; readonly role: PromptRole }[] = [];
  for (const node of nodes.values()) {
    for (const [name, value] of Object.entries(node.inputs)) {
      const role = ROLES.find((candidate) => ROLE_PATTERN[candidate].test(name));
      if (role === undefined) continue;

      const upstream = linkedNodeId(value);
      if (upstream !== null) seeds.push({ id: upstream, role });
    }
  }
  return seeds;
}

/** 実行内容から拾ったプロンプト 1 つ */
export interface TaskPrompt {
  /** 実行した prompt のノード id */
  readonly nodeId: string;
  /**
   * そのノードの種類（`class_type`）。
   * **いま開いているワークフローのカードとは対応しない**（別の実行かもしれない）ので、
   * 出どころは実行した内容そのものから示す。
   */
  readonly classType: string;
  readonly inputName: string;
  readonly text: string;
  /** ポジ／ネガ。決められなければ null */
  readonly role: PromptRole | null;
}

/** モデルファイルを使った入力。区分を入力名でも見分けるので名前を添える */
export interface ModelUse {
  readonly file: string;
  readonly input: string;
}

/** 実行内容の要約（使ったモデルとプロンプト） */
interface TaskSummary {
  /** 使ったモデルファイル（ファイルの重複を除く） */
  readonly models: readonly ModelUse[];
  readonly prompts: readonly TaskPrompt[];
}

// ─────────────────────────────
// モデルの区分。モデル・LoRA・その他（clip・vae など）
// ─────────────────────────────

/** モデルの区分 */
export type ModelKind = 'model' | 'lora' | 'other';

/** 区分を出す順 */
export const MODEL_KINDS: readonly ModelKind[] = ['model', 'lora', 'other'];

/** 区分ごとのモデルファイル。それぞれ名前の順 */
export type ModelGroups = Readonly<Record<ModelKind, readonly string[]>>;

/** 区分を決める一覧（正規化したファイル名）。取れていなければ空 */
export interface ModelKindNames {
  /** モデル（`checkpoints`・`diffusion_models`）の一覧 */
  readonly modelNames: ReadonlySet<string>;
  /** LoRA（`loras`）の一覧 */
  readonly loraNames: ReadonlySet<string>;
}

/** 一覧が取れないときの代わり。入力名で分ける（ノード名は見ない） */
const LORA_INPUT = /lora/iu;
const OTHER_INPUT = /vae|clip|encoder/iu;

/** モデルファイルの区分。種別の一覧で分け、一覧が無ければ入力名で分ける */
export function modelKindOf(value: string, inputName: string, names: ModelKindNames): ModelKind {
  const name = normalizeModelName(value);
  if (names.loraNames.has(name)) return 'lora';
  if (names.modelNames.has(name)) return 'model';
  if (names.loraNames.size > 0 || names.modelNames.size > 0) return 'other';
  if (LORA_INPUT.test(inputName)) return 'lora';
  return OTHER_INPUT.test(inputName) ? 'other' : 'model';
}

/** 使ったモデルファイルを区分ごとに分ける */
export function groupModels(uses: readonly ModelUse[], names: ModelKindNames): ModelGroups {
  const found = { model: new Set<string>(), lora: new Set<string>(), other: new Set<string>() };
  for (const use of uses) found[modelKindOf(use.file, use.input, names)].add(use.file);
  return {
    model: [...found.model].sort(),
    lora: [...found.lora].sort(),
    other: [...found.other].sort(),
  };
}

/** 実行した prompt のノードから、使ったモデルファイルとプロンプトを拾う */
export function extractTaskSummary(
  nodes: ReadonlyMap<string, PromptNode>,
  definitions: NodeDefinitionMap,
): TaskSummary {
  const models = new Map<string, ModelUse>();
  const prompts: TaskPrompt[] = [];
  const roles = classifyRoles(nodes);

  for (const [nodeId, node] of nodes) {
    const definition = definitions.get(node.classType);

    for (const [name, value] of Object.entries(node.inputs)) {
      if (typeof value !== 'string' || value.length === 0) continue;

      if (MODEL_FILE.test(value)) {
        if (!models.has(value)) models.set(value, { file: value, input: name });
        continue;
      }

      const input = definition?.inputs.find((candidate) => candidate.name === name);
      if (input?.config.multiline === true) {
        prompts.push({
          nodeId,
          classType: node.classType,
          inputName: name,
          text: value,
          role: roles.get(nodeId) ?? null,
        });
      }
    }
  }

  // ポジ → ネガ → 未分類の順に並べる（読む順に近い）
  const rank = (prompt: TaskPrompt): number =>
    prompt.role === 'positive' ? 0 : prompt.role === 'negative' ? 1 : 2;

  return { models: [...models.values()], prompts: [...prompts].sort((a, b) => rank(a) - rank(b)) };
}

/** 1ノード分の設定（seed / steps / cfg など、リンクでも長文でもない値） */
interface TaskSettings {
  readonly nodeId: string;
  readonly classType: string;
  readonly values: readonly { readonly name: string; readonly text: string }[];
}

/** 長すぎる値は設定欄には出さない（プロンプト扱いのものが紛れ込むのを防ぐ） */
const SETTING_TEXT_LIMIT = 80;

/**
 * 実行時の設定一覧。**モデル名・プロンプトとして既に出したものは除く**。
 * リンク（`["12", 0]`）は上流から来る値なので出さない。
 */
export function extractSettings(
  nodes: ReadonlyMap<string, PromptNode>,
  definitions: NodeDefinitionMap,
): TaskSettings[] {
  const settings: TaskSettings[] = [];

  for (const [nodeId, node] of nodes) {
    const definition = definitions.get(node.classType);
    const values: { name: string; text: string }[] = [];

    for (const [name, value] of Object.entries(node.inputs)) {
      if (typeof value === 'number' || typeof value === 'boolean') {
        values.push({ name, text: String(value) });
        continue;
      }
      if (typeof value !== 'string' || value.length === 0) continue;
      if (MODEL_FILE.test(value) || value.length > SETTING_TEXT_LIMIT) continue;

      const input = definition?.inputs.find((candidate) => candidate.name === name);
      if (input?.config.multiline === true) continue;

      values.push({ name, text: value });
    }

    if (values.length > 0) settings.push({ nodeId, classType: node.classType, values });
  }

  return settings.sort((a, b) => Number(a.nodeId) - Number(b.nodeId));
}

/** 役割の表示名の鍵 */
export const ROLE_LABEL = {
  positive: 'queue.detail.role.positive',
  negative: 'queue.detail.role.negative',
} as const satisfies Record<PromptRole, MessageKey>;

/** 実行したノード 1 つの所要時間 */
interface NodeDuration {
  readonly nodeId: string;
  readonly durationMs: number | null;
}

/** 実行した順番と所要時間。**まだ終わっていない区間は null**（時間は描画時に測らない） */
export function nodeDurations(timings: readonly NodeTiming[]): NodeDuration[] {
  return timings.map((timing) => ({
    nodeId: timing.nodeId,
    durationMs: timing.endedAt === null ? null : timing.endedAt - timing.startedAt,
  }));
}

/** 設定と所要時間をノード単位で1行にまとめたもの */
export interface TaskNodeRow {
  readonly nodeId: string;
  readonly classType: string | null;
  /** 実行順（1始まり）。時刻が無ければ null */
  readonly order: number | null;
  readonly durationMs: number | null;
  readonly values: readonly { readonly name: string; readonly text: string }[];
}

/**
 * 設定一覧に所要時間を重ねる。**時刻がある実行は実行順**に並べ、
 * 実行されなかった（キャッシュ・迂回された）ノードは後ろに置く。
 * 同じノードが複数回動いた場合は**合算**し、順番は最初に動いた位置にする。
 */
export function mergeNodeRows(
  settings: readonly TaskSettings[],
  durations: readonly NodeDuration[],
): TaskNodeRow[] {
  const byNode = new Map(settings.map((node) => [node.nodeId, node]));
  const rows: TaskNodeRow[] = [];
  const placed = new Map<string, number>();

  for (const duration of durations) {
    const seen = placed.get(duration.nodeId);
    if (seen !== undefined) {
      const previous = rows[seen];
      if (previous && duration.durationMs !== null) {
        rows[seen] = {
          ...previous,
          durationMs: (previous.durationMs ?? 0) + duration.durationMs,
        };
      }
      continue;
    }

    const node = byNode.get(duration.nodeId);
    placed.set(duration.nodeId, rows.length);
    rows.push({
      nodeId: duration.nodeId,
      classType: node?.classType ?? null,
      order: rows.length + 1,
      durationMs: duration.durationMs,
      values: node?.values ?? [],
    });
  }

  for (const node of settings) {
    if (placed.has(node.nodeId)) continue;

    rows.push({
      nodeId: node.nodeId,
      classType: node.classType,
      order: null,
      durationMs: null,
      values: node.values,
    });
  }

  return rows;
}
