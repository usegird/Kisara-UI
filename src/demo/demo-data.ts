import definitionsJson from '@/demo/definitions.json';
import workflowJson from '@/demo/workflow.json';
import { buildNodeDefinitions } from '@/graph/node-definition';
import { readOpenedFile } from '@/graph/workflow-source';
import { t } from '@/i18n';
import { openWorkflow } from '@/store/persist/workflow-file';
import { DEFAULT_COLUMN_WIDTHS, type ColumnWidths } from '@/store/settings-fields/column-widths';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';

const SAMPLE_NAME = 'FlowStyleDemo';

export function installDemoDefinitions(): void {
  const definitions = buildNodeDefinitions(definitionsJson, { dropOptions: false });
  useDefinitionsStore.setState({
    status: 'ready',
    source: null,
    definitions,
    fetchedAt: null,
    frequency: [],
    error: null,
  });
}

export function openDemoSample(): void {
  openWorkflow(structuredClone(workflowJson), SAMPLE_NAME);
}

export async function openDemoFile(file: File): Promise<void> {
  const { definitions } = useDefinitionsStore.getState();
  const opened = readOpenedFile(await file.arrayBuffer(), definitions);
  if (opened.kind === 'image') {
    throw new Error(t('demo.noWorkflowInImage'));
  }
  openWorkflow(opened.source, file.name.replace(/\.(json|png)$/i, ''));
}

const DEMO_COLUMN_WIDTHS: ColumnWidths = {
  ...DEFAULT_COLUMN_WIDTHS,
  app: 336,
  cards: 457,
  variablesGap: 156,
  variables: 255,
};

export function resetDemoView(): void {
  useSettingsStore.setState({ columnWidths: DEMO_COLUMN_WIDTHS });
}
