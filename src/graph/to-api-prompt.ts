import { flattenWorkflow, reachableNodes, type FlatNode } from '@/graph/api-prompt-flatten';
import type { NodeDefinitionMap, NodeId, Workflow } from '@/graph/types';
import { resolveWidgetValues } from '@/graph/widgets';
import { t } from '@/i18n';
import { messageOf } from '@/lib/fault';
import { setOwn } from '@/lib/own-key';

// ─────────────────────────────
// Workflow JSON → API Prompt Format（実行時に毎回導出する派生物。状態に持たない）。解決できないものは
// 黙って捨てず diagnostics に積む（呼び出し側が実行を拒否する）。
// ─────────────────────────────

/** 実行の形のノード 1 つ */
interface ApiPromptNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

/** 実行の形（ノード id → ノード）。subgraph の中の id は `<instance>:<inner>` に名前空間化する */
export type ApiPrompt = Record<string, ApiPromptNode>;

/** 実行の形に直すときの問題の種類 */
type ApiPromptDiagnosticCode =
  | 'unknown-class'
  | 'unresolved-widgets'
  /** 値の数は合うが並び・型が食い違う。ずれた値を当てないよう、このノードを送らない */
  | 'misaligned-widgets'
  /** 入力元のノードを送らないので、このノードも送らない */
  | 'excluded-downstream'
  | 'missing-input'
  | 'no-output-node'
  /** 参照先が実行対象に含まれていない（このまま送ると ComfyUI 側で弾かれる） */
  | 'dangling-reference'
  /** ノードの形が想定外で、実行の形に変えられなかった */
  | 'broken-node'
  /** subgraph の定義が自分を含むので、開けなかった */
  | 'subgraph-cycle';

/** 実行の形に直すときの問題 1 件 */
export interface ApiPromptDiagnostic {
  readonly code: ApiPromptDiagnosticCode;
  readonly nodeId: string;
  readonly classType: string;
  readonly message: string;
}

/** 実行の形と、直すときに見つけた問題 */
export interface ApiPromptResult {
  readonly prompt: ApiPrompt;
  readonly diagnostics: readonly ApiPromptDiagnostic[];
}

/**
 * 平坦化した API Prompt のノード id（`12` / subgraph 内なら `12:34`）が
 * **どのカードのものか**を返す。実行中・エラーの表示をカードに紐づけるのに使う。
 */
export function cardIdOfPromptNode(promptNodeId: string): NodeId | null {
  const head = promptNodeId.split(':')[0];
  const id = Number(head);
  return head !== undefined && head.length > 0 && Number.isInteger(id) ? id : null;
}

/**
 * Workflow JSON を実行の形に直す。subgraph は再帰的に平坦化し、中継は透かし、バイパスは型の合う
 * 入力へ素通し、ミュートは遮断する。出力ノードから到達できるノードだけを出す
 */
export function toApiPrompt(workflow: Workflow, definitions: NodeDefinitionMap): ApiPromptResult {
  const { flat, cycles } = flattenWorkflow(workflow, definitions);
  const diagnostics: ApiPromptDiagnostic[] = cycles.map(({ id, type, name }) => ({
    code: 'subgraph-cycle',
    nodeId: id,
    classType: type,
    message: t('graph.prompt.subgraphCycle', { name }),
  }));

  // ── 出力ノードからの到達性で刈り込む ──────────
  const reachable = reachableNodes(flat);
  if (reachable.size === 0) {
    diagnostics.push({
      code: 'no-output-node',
      nodeId: '',
      classType: '',
      message: t('graph.prompt.noOutput'),
    });
  }

  // ── API Prompt の組み立て ────────────────
  const prompt: ApiPrompt = {};
  /** 送らないノード。ずれた値を当てそうなものと、その下流 */
  const excluded = new Set<string>();

  for (const id of reachable) {
    const entry = flat.get(id);
    if (!entry) continue;
    // 1 ノードずつ閉じ込める。読めない形のノードは報告して外す
    try {
      const node = buildPromptNode(entry, diagnostics, excluded);
      if (node !== null) setOwn(prompt, id, node);
    } catch (error) {
      diagnostics.push({
        code: 'broken-node',
        nodeId: id,
        classType: String(flat.get(id)?.node.type ?? ''),
        message: t('graph.prompt.brokenNode', {
          message: messageOf(error),
        }),
      });
    }
  }

  excludeDownstream(prompt, excluded, diagnostics);
  if (excluded.size > 0 && !Object.keys(prompt).some((id) => isOutput(flat.get(id)))) {
    diagnostics.push({
      code: 'no-output-node',
      nodeId: '',
      classType: '',
      message: t('graph.prompt.noOutputLeft'),
    });
  }

  addDanglingReferences(prompt, diagnostics);
  return { prompt, diagnostics };
}

/**
 * 平坦化したノード 1 つを実行の形にする。送らないノードは null（理由は報告に積む。
 * ずれた値を当てそうなものは `excluded` にも入れる）
 */
function buildPromptNode(
  entry: FlatNode,
  diagnostics: ApiPromptDiagnostic[],
  excluded: Set<string>,
): ApiPromptNode | null {
  const { id, definition } = entry;
  if (!definition) {
    diagnostics.push({
      code: 'unknown-class',
      nodeId: id,
      classType: entry.node.type,
      message: t('graph.prompt.unknownClass', { type: entry.node.type }),
    });
    return null;
  }

  // パラメータの位置が解けなくても**ノード自体は落とさない**。
  // 落とすと、このノードを参照している側のリンクが宙に浮き、
  // ComfyUI 側で「Exception when validating inner node」になって実行できなくなる。
  // 解けた分の値だけ入れ、残りは ComfyUI の既定値に委ねる（注意として報告する）。
  const widgets = resolveWidgetValues(entry.node, definition);
  // 数は合うのに並び・型が食い違うのは、ずれた値を当てる形。**このノードは送らない**
  // （保存先や消す名前をずれた値で受けさせない）。
  // 数が合わないものは値を当てないので、既定値に任せて送る
  if (!widgets.ok && widgets.reason !== 'slot-count-mismatch') {
    excluded.add(id);
    diagnostics.push({
      code: 'misaligned-widgets',
      nodeId: id,
      classType: definition.name,
      message: t(
        widgets.reason === 'named-mismatch'
          ? 'graph.prompt.namedMismatch'
          : 'graph.prompt.typeMismatch',
      ),
    });
    return null;
  }
  if (!widgets.ok) {
    diagnostics.push({
      code: 'unresolved-widgets',
      nodeId: id,
      classType: definition.name,
      message: t('graph.prompt.unresolvedWidgets', {
        expected: widgets.expected,
        actual: widgets.actual,
      }),
    });
  }

  return { class_type: definition.name, inputs: buildInputs(entry, widgets, diagnostics) };
}

/** ノード 1 つの入力（線は `[供給元の id, slot]`、widget は値）。必須の未接続は報告に積む */
function buildInputs(
  entry: FlatNode,
  widgets: ReturnType<typeof resolveWidgetValues>,
  diagnostics: ApiPromptDiagnostic[],
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  const definition = entry.definition;
  if (!definition) return inputs;

  for (const input of definition.inputs) {
    const source = entry.sources.get(input.name);
    if (source) {
      setOwn(inputs, input.name, [source.nodeId, source.slot]);
      continue;
    }
    if (widgets.ok && widgets.byInput.has(input.name)) {
      setOwn(inputs, input.name, widgets.byInput.get(input.name));
      continue;
    }
    // 解けていない分は既定値に任せるので、必須でも「未接続」とは言わない
    if (input.required && widgets.ok) {
      diagnostics.push({
        code: 'missing-input',
        nodeId: entry.id,
        classType: definition.name,
        message: t('graph.prompt.missingInput', { name: input.name }),
      });
    }
  }

  // `/object_info` に載らない入力を拾う。画面側が動的に足すものがあり、定義だけで組むと
  // 繋いだ線が黙って消える（画面には出ているので気づけない）。
  // 受け取る側は `**kwargs` で名前の接頭辞を見るだけなので、名前のまま送る。
  for (const [name, source] of entry.sources) {
    if (Object.hasOwn(inputs, name)) continue;
    setOwn(inputs, name, [source.nodeId, source.slot]);
  }
  return inputs;
}

/**
 * 送らないノードを入力に取るノードも、たどれるだけ外す。
 * ずれた値で作ったものを下流へ渡さないため。外したものは報告に積む
 */
function excludeDownstream(
  prompt: ApiPrompt,
  excluded: Set<string>,
  diagnostics: ApiPromptDiagnostic[],
): void {
  let changed = excluded.size > 0;
  while (changed) {
    changed = false;
    for (const [id, node] of Object.entries(prompt)) {
      const source = Object.values(node.inputs).find(
        (value) => Array.isArray(value) && typeof value[0] === 'string' && excluded.has(value[0]),
      );
      if (!Array.isArray(source)) continue;
      delete prompt[id];
      excluded.add(id);
      changed = true;
      diagnostics.push({
        code: 'excluded-downstream',
        nodeId: id,
        classType: node.class_type,
        message: t('graph.prompt.excludedDownstream', { source: String(source[0]) }),
      });
    }
  }
}

/**
 * 参照先が prompt に無いリンクが残っていないか（落とし忘れの検出）。
 * 残したまま送ると ComfyUI 側で検証エラーになるので、送る前に気づけるようにする
 */
function addDanglingReferences(prompt: ApiPrompt, diagnostics: ApiPromptDiagnostic[]): void {
  for (const [id, node] of Object.entries(prompt)) {
    for (const [name, value] of Object.entries(node.inputs)) {
      if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
      if (value[0] in prompt) continue;

      diagnostics.push({
        code: 'dangling-reference',
        nodeId: id,
        classType: node.class_type,
        message: t('graph.prompt.danglingReference', { name, source: value[0] }),
      });
    }
  }
}

function isOutput(entry: FlatNode | undefined): boolean {
  return entry?.definition?.outputNode === true;
}
