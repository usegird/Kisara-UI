import definitionsJson from '@/demo/definitions.json';
import workflowJson from '@/demo/workflow.json';
import { buildNodeDefinitions } from '@/graph/node-definition';
import { readOpenedFile } from '@/graph/workflow-source';
import { t } from '@/i18n';
import { openWorkflow } from '@/store/persist/workflow-file';
import { DEFAULT_COLUMN_WIDTHS, type ColumnWidths } from '@/store/settings-fields/column-widths';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// デモに埋め込んだノード定義と見本を載せる。どちらも `/object_info` と同じ形のデータで、
// 本体と同じ射影を通す。**通信はしない。**
// ─────────────────────────────

/** 見本の名前。画面には出さないが、ストアの名前として持つ */
const SAMPLE_NAME = 'FlowStyleDemo';

/**
 * 埋め込んだ定義をストアへ載せる。選択肢は落とさない
 * （落とすと、欄を開いたときに接続先へ取りに行こうとする）
 */
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

/** 見本を開き直す。埋め込みのデータは書き換えられないよう、写しを渡す */
export function openDemoSample(): void {
  openWorkflow(structuredClone(workflowJson), SAMPLE_NAME);
}

/**
 * 手元のファイルを開いて今の画面を置き換える（タブは持たない）。
 * ワークフローの無い画像は断る。読めなければ理由付きで throw する
 */
export async function openDemoFile(file: File): Promise<void> {
  const { definitions } = useDefinitionsStore.getState();
  const opened = readOpenedFile(await file.arrayBuffer(), definitions);
  if (opened.kind === 'image') {
    throw new Error(t('demo.noWorkflowInImage'));
  }
  openWorkflow(opened.source, file.name.replace(/\.(json|png)$/i, ''));
}

/**
 * デモの列の幅の既定。App・カード・変数の列と、変数の線を通す余白を決める
 */
const DEMO_COLUMN_WIDTHS: ColumnWidths = {
  ...DEFAULT_COLUMN_WIDTHS,
  app: 336,
  cards: 457,
  variablesGap: 156,
  variables: 255,
};

/** 見本に戻すときの画面の戻し。列の幅をデモの既定に戻す（設定はデモの置き場にだけ書かれる） */
export function resetDemoView(): void {
  useSettingsStore.setState({ columnWidths: DEMO_COLUMN_WIDTHS });
}
