import { applyAppValues, appValuesInUse, withSavedAppValues } from '@/graph/app-input-values';
import { cardLabels } from '@/graph/rows';
import { toApiPrompt, type ApiPrompt } from '@/graph/to-api-prompt';
import type { NodeDefinitionMap, Workflow } from '@/graph/types';
import { t } from '@/i18n';
import { messageOf } from '@/lib/fault';
import { comfyFailureOf, formatComfyFailure } from '@/queue/comfy-failure-text';
import type { ExecutionError } from '@/queue/execution-state';
import type { SubmitFailure, SubmittedRun } from '@/queue/task-log';
import { comfyPort } from '@/store/ports/comfy-port';
import { useAppValuesStore, type AppValues } from '@/store/use-app-values-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useRunReportStore } from '@/store/use-run-report-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { activeSession, useTabsStore } from '@/store/use-tabs-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

// ─────────────────────────────
// 実行の投入。画面の実行ボタン（use-run-workflow）と会話から呼んだワークフローの両方が通す。
// `POST /prompt` は GPU を消費するので、画面の明示操作からしか呼ばない。
// ─────────────────────────────

/** 接続先に断られた（拒まれた）ときの HTTP の状態 */
const HTTP_FORBIDDEN = 403;

/** 投げる材料。アクティブなタブか、指定したタブから作る */
export interface RunSource {
  readonly workflow: Workflow;
  readonly appValues: AppValues;
  readonly name: string;
  /**
   * そのタブのセッション。実行に添えて、記録とタスクの列を分ける
   */
  readonly session: string | undefined;
  /** 受理されたあと、そのタブで生成のたびに変わる値を進める */
  readonly advance: (definitions: NodeDefinitionMap) => void;
}

/** アクティブなタブから投げる材料を作る。ワークフローが無ければ null */
export function activeRunSource(): RunSource | null {
  const graph = useGraphStore.getState();
  if (!graph.workflow) return null;
  return {
    workflow: graph.workflow,
    appValues: useAppValuesStore.getState().values,
    name: graph.name,
    session: activeSession(useTabsStore.getState()) ?? undefined,
    advance: (definitions) => useGraphStore.getState().advanceSeeds(definitions),
  };
}

/** 指定したタブ（アクティブでもよい）。ワークフローが無ければ null */
export function tabRunSource(tabId: string): RunSource | null {
  const snapshot = useTabsStore.getState().readTab(tabId);
  if (!snapshot?.workflow) return null;
  return {
    workflow: snapshot.workflow,
    appValues: snapshot.appValues,
    name: snapshot.name,
    session: useTabsStore.getState().tabs.find((tab) => tab.id === tabId)?.runSession,
    advance: (definitions) => useTabsStore.getState().advanceTabSeeds(tabId, definitions),
  };
}

/**
 * 投げる。受理された実行の id を返し、投げられなければ null。実行の操作は文字を出さない
 */
export async function submitRun(source: RunSource): Promise<string | null> {
  const definitions = useDefinitionsStore.getState().definitions;
  const { fail, clearForSubmit } = useExecutionStore.getState();
  const { workflow } = source;

  // 実行中に足す場合は、走っている実行の表示を消さない（受理後に id だけ覚える）
  const busyNow = ['running', 'queued'].includes(useExecutionStore.getState().status);
  if (!busyNow) clearForSubmit();

  // 投げた時点のカードの表記。詳細でノードを示すのに使う
  let submitted: SubmittedRun = {
    name: source.name,
    labels: Object.fromEntries(
      [...cardLabels(workflow, definitions)].map(([id, label]) => [String(id), label]),
    ),
    notes: [],
  };
  const outcome: SubmitOutcome = {
    // 走っている実行があるときに断られても、**走っている方を失敗にしない**
    // （断られた分は下の控えで 1 件のタスクとして出る）
    fail: (error) => {
      if (!busyNow) fail(error);
    },
    // 断られたら**1 回ごとに**タスクとして控える（ComfyUI 側に残らないため）
    log: (failure, sent) => {
      useTaskLogStore
        .getState()
        .recordRejected({ ...submitted, failure, prompt: sent, at: Date.now() });
    },
  };

  // 通知を諦めた（タイムアウト・切断扱い）間は送らない。送っても結果が届かず、不明のまま積み上がる
  // （繰り返し実行もここで止まる）
  if (useConnectionStore.getState().socketTimeout !== null) {
    return rejectBeforeSend(outcome, t('run.execution.socketDown'));
  }

  const converted = convertOrReject(outcome, workflow, definitions);
  if (converted === null) return null;
  const { prompt, diagnostics } = converted;
  const report = useRunReportStore.getState();
  report.begin(diagnostics);
  // 出力ノードが残らなければ投入しない（送っても断られる。ずれた値のノードを外した結果のこともある）
  const noOutput = diagnostics.find((diagnostic) => diagnostic.code === 'no-output-node');
  if (noOutput !== undefined) return rejectBeforeSend(outcome, noOutput.message);
  // 変換の注意はタスクの詳細に出す（タブを分けない）
  submitted = {
    ...submitted,
    notes: diagnostics.map(({ nodeId, classType, message }) => ({ nodeId, classType, message })),
  };

  // 断られたときに「送った内容」として控えるので、try の外で持つ
  let withAppValues: ApiPrompt = prompt;

  try {
    // アプリ入力に値が入っていれば、**実行のときだけ**それを優先する
    // 外したアプリ入力の値は使わない（画面に出ていない値で実行しない）
    const values = appValuesInUse(workflow, source.appValues);
    withAppValues = applyAppValues(prompt, values);
    return await sendRun(source, withAppValues, submitted);
  } catch (error) {
    reportSubmitError(outcome, report, error, withAppValues);
    return null;
  }
}

/** 失敗を実行の表示に出す手続きと、断られた 1 回をタスクとして控える手続き */
interface SubmitOutcome {
  readonly fail: (error: ExecutionError) => void;
  readonly log: (failure: SubmitFailure, sent: ApiPrompt | null) => void;
}

/** 送る前に止めた。失敗として出し、送っていない 1 回として控える */
function rejectBeforeSend(outcome: SubmitOutcome, message: string): null {
  outcome.fail({ node: null, message });
  outcome.log({ reason: message, nodes: [] }, null);
  return null;
}

/**
 * 実行の形に変える。読めない形のワークフローで止まらないよう、変換の失敗も失敗として出す。
 * ここで投げたままにすると「送信中」が解けず、実行できなくなる
 */
function convertOrReject(
  outcome: SubmitOutcome,
  workflow: Workflow,
  definitions: NodeDefinitionMap,
): ReturnType<typeof toApiPrompt> | null {
  try {
    return toApiPrompt(workflow, definitions);
  } catch (error) {
    rejectBeforeSend(outcome, t('run.convertFailed', { message: messageOf(error) }));
    return null;
  }
}

/** 送る。受理されたら記録・進み具合・控えを始め、seed を進めて実行の id を返す */
async function sendRun(
  source: RunSource,
  prompt: ApiPrompt,
  submitted: SubmittedRun,
): Promise<string> {
  const { baseUrl, clientId } = useSettingsStore.getState();
  const definitions = useDefinitionsStore.getState().definitions;
  // 画像に埋め込ませるワークフローは、保存と同じくアプリ入力の値を載せたもの
  const sentWorkflow = withSavedAppValues(source.workflow, source.appValues);
  const accepted = await comfyPort().run.submit(baseUrl, {
    prompt,
    clientId,
    workflow: sentWorkflow,
    session: source.session,
  });
  // 実行の記録には送ったものを使う（サーバー側で書き換えられた値を残さない）
  useRunHistoryStore.getState().rememberSent(accepted.promptId, sentWorkflow);
  // 分母は**送った prompt のノード数**（ミュート・バイパスは既に除かれている）
  useExecutionStore.getState().start(accepted.promptId, Object.keys(prompt).length);
  // どのワークフローの実行だったかは ComfyUI 側に残らないので、端末側で覚える
  useTaskLogStore.getState().recordSubmitted(accepted.promptId, submitted);
  // ComfyUI 本家と同じく、**キューに入れた直後**に seed を進める（サーバーは関与しない）
  source.advance(definitions);
  return accepted.promptId;
}

/** 送って断られた・届かなかった理由を出し、送った内容と一緒に控える */
function reportSubmitError(
  outcome: SubmitOutcome,
  report: ReturnType<typeof useRunReportStore.getState>,
  error: unknown,
  sent: ApiPrompt,
): void {
  const rejection = comfyPort().run.rejectionOf(error);
  const failure = rejection === null ? comfyPort().connection.failureOf(error) : null;
  if (rejection !== null) {
    const reason = rejection.reason ?? formatComfyFailure(rejection);
    report.reject({
      reason,
      nodes: Object.fromEntries(rejection.nodeErrors.map((e) => [e.nodeId, e.messages])),
    });
    outcome.fail({ node: rejection.nodeErrors[0]?.nodeId ?? null, message: reason });
    outcome.log({ reason, nodes: rejection.nodeErrors }, sent);
    return;
  }
  if (failure !== null) {
    if (failure.status === HTTP_FORBIDDEN) report.forbid();
    const message = formatComfyFailure(failure);
    outcome.fail({ node: null, message });
    outcome.log({ reason: message, nodes: [], forbidden: failure.status === HTTP_FORBIDDEN }, sent);
    return;
  }
  // 要求の前に投げられた失敗（接続先の指定の誤り）は理由の符号を持つので、そこから文にする
  const message = comfyFailureOf(error) === null ? String(error) : formatComfyFailure(error);
  outcome.fail({ node: null, message });
  outcome.log({ reason: message, nodes: [] }, sent);
}
