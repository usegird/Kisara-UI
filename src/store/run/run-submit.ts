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

const HTTP_FORBIDDEN = 403;

export interface RunSource {
  readonly workflow: Workflow;
  readonly appValues: AppValues;
  readonly name: string;
  readonly session: string | undefined;
  readonly advance: (definitions: NodeDefinitionMap) => void;
}

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

export async function submitRun(source: RunSource): Promise<string | null> {
  const definitions = useDefinitionsStore.getState().definitions;
  const { fail, clearForSubmit } = useExecutionStore.getState();
  const { workflow } = source;

  const busyNow = ['running', 'queued'].includes(useExecutionStore.getState().status);
  if (!busyNow) clearForSubmit();

  let submitted: SubmittedRun = {
    name: source.name,
    labels: Object.fromEntries(
      [...cardLabels(workflow, definitions)].map(([id, label]) => [String(id), label]),
    ),
    notes: [],
  };
  const outcome: SubmitOutcome = {
    fail: (error) => {
      if (!busyNow) fail(error);
    },
    log: (failure, sent) => {
      useTaskLogStore
        .getState()
        .recordRejected({ ...submitted, failure, prompt: sent, at: Date.now() });
    },
  };

  if (useConnectionStore.getState().socketTimeout !== null) {
    return rejectBeforeSend(outcome, t('run.execution.socketDown'));
  }

  const converted = convertOrReject(outcome, workflow, definitions);
  if (converted === null) return null;
  const { prompt, diagnostics } = converted;
  const report = useRunReportStore.getState();
  report.begin(diagnostics);
  const noOutput = diagnostics.find((diagnostic) => diagnostic.code === 'no-output-node');
  if (noOutput !== undefined) return rejectBeforeSend(outcome, noOutput.message);
  submitted = {
    ...submitted,
    notes: diagnostics.map(({ nodeId, classType, message }) => ({ nodeId, classType, message })),
  };

  let withAppValues: ApiPrompt = prompt;

  try {
    const values = appValuesInUse(workflow, source.appValues);
    withAppValues = applyAppValues(prompt, values);
    return await sendRun(source, withAppValues, submitted);
  } catch (error) {
    reportSubmitError(outcome, report, error, withAppValues);
    return null;
  }
}

interface SubmitOutcome {
  readonly fail: (error: ExecutionError) => void;
  readonly log: (failure: SubmitFailure, sent: ApiPrompt | null) => void;
}

function rejectBeforeSend(outcome: SubmitOutcome, message: string): null {
  outcome.fail({ node: null, message });
  outcome.log({ reason: message, nodes: [] }, null);
  return null;
}

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

async function sendRun(
  source: RunSource,
  prompt: ApiPrompt,
  submitted: SubmittedRun,
): Promise<string> {
  const { baseUrl, clientId } = useSettingsStore.getState();
  const definitions = useDefinitionsStore.getState().definitions;
  const sentWorkflow = withSavedAppValues(source.workflow, source.appValues);
  const accepted = await comfyPort().run.submit(baseUrl, {
    prompt,
    clientId,
    workflow: sentWorkflow,
    session: source.session,
  });
  useRunHistoryStore.getState().rememberSent(accepted.promptId, sentWorkflow);
  useExecutionStore.getState().start(accepted.promptId, Object.keys(prompt));
  useTaskLogStore.getState().recordSubmitted(accepted.promptId, submitted);
  source.advance(definitions);
  return accepted.promptId;
}

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
      inputs: Object.fromEntries(rejection.nodeErrors.map((e) => [e.nodeId, e.inputNames])),
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
  const message = comfyFailureOf(error) === null ? String(error) : formatComfyFailure(error);
  outcome.fail({ node: null, message });
  outcome.log({ reason: message, nodes: [] }, sent);
}
