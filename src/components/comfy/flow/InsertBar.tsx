import { cva } from 'class-variance-authority';
import { BookSearch, Bot, Brush, SquareAsterisk, WholeWord, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import { ModelPickerDialog } from '@/components/comfy/flow/dialogs/ModelPickerDialog';
import type { WorkflowToolDialogProps } from '@/components/comfy/flow/dialogs/WorkflowToolDialog';
import { InsertCaretHandle, InsertCaretMarker } from '@/components/ui/insert-caret-marker';
import { lazyPart } from '@/components/ui/lazy-part';
import { LORA_FOLDER } from '@/graph/model-files';
import { isToolName, readWorkflowTool } from '@/graph/workflow-tool';
import { useInsertSources, type SourceState } from '@/hooks/flow/use-insert-sources';
import { useLoraInsert } from '@/hooks/flow/use-lora-insert';
import { useTextDropCaret } from '@/hooks/ui/use-text-drop-caret';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useTagsStore } from '@/store/use-tags-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

// ─────────────────────────────
// アプリ入力の列の右脇の差し込みのアイコンと、LLM からの呼び出し設定のアイコン。
// Lora を選ぶ手続きは `useLoraInsert` が持ち、ここは開け閉てと切り替えだけを持つ。
// ─────────────────────────────

// LLM からの呼び出し設定は押したときだけ読む（初期 JS に載せない）
const WorkflowToolDialog = lazyPart<WorkflowToolDialogProps>(
  'insertBar.tool.label',
  () =>
    import('@/components/comfy/flow/dialogs/WorkflowToolDialog').then((m) => m.WorkflowToolDialog),
  () => null,
);

// 押せないときも理由は指して読める（title）。斜線を重ねるので relative
/** LLM からの呼び出し設定のアイコン。設定してあれば緑 */
const toolIcon = cva('size-4', { variants: { set: { true: 'text-success', false: '' } } });

const ICON_BUTTON = `text-muted-foreground hover:bg-muted hover:text-foreground relative rounded-md
  p-1 disabled:opacity-40 disabled:hover:bg-transparent`;

/** アイコン。サーバーの事情で使えないときは斜線を引く */
function SourceIcon({
  icon: Icon,
  source,
}: {
  readonly icon: LucideIcon;
  readonly source: SourceState;
}): React.ReactElement {
  return (
    <>
      <Icon className="size-4" aria-hidden />
      {source.kind === 'unavailable' ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 h-[1.5px] w-5 -translate-x-1/2 -translate-y-1/2
            -rotate-45 bg-current"
        />
      ) : null}
    </>
  );
}

/** 押してもキャレットを欄から外さない（押し下げの既定を止める） */
function keepCaret(event: React.MouseEvent): void {
  event.preventDefault();
}

/**
 * 差し込みの 4 つのアイコン（Lora・スタイル・ワイルドカード・タグ）を常に並べ、サーバーの事情で使えない
 * ものは斜線を引いて押せなくする。どれもキャレットに拠らず開ける
 */
export function InsertBar(): React.ReactElement {
  const lora = useLoraInsert();
  // 差し込みの画面から掴んだ文字を、欄に重ねている間はキャレットで位置を見せ、落ちたらそこへ入れる
  useTextDropCaret();
  const loraOpen = lora.open;
  const setLoraOpen = lora.setOpen;

  const sources = useInsertSources();
  const firstStyle = useStylesStore((state) => state.table.styles[0]?.name ?? null);
  const openStyleEditor = useStylesStore((state) => state.openEditor);
  const requestCloseStyle = useStylesStore((state) => state.requestCloseEditor);
  const openWildcards = useWildcardsStore((state) => state.openPanel);
  const wildcardsOpen = useWildcardsStore((state) => state.panelOpen);
  const closeWildcards = useWildcardsStore((state) => state.closePanel);
  const editingStyle = useStylesStore((state) => state.editing !== null);
  const tagPanelOpen = useTagsStore((state) => state.panelOpen);
  const openTags = useTagsStore((state) => state.openPanel);
  const requestCloseTags = useTagsStore((state) => state.requestClosePanel);
  const hasWorkflow = useGraphStore((state) => state.workflow !== null);
  // LLM からの呼び出し設定を持ち、機能名が字の決まりに合うなら、アイコンを緑にする
  const toolSet = useGraphStore((state) => {
    const tool = state.workflow === null ? null : readWorkflowTool(state.workflow);
    return tool !== null && isToolName(tool.name);
  });
  const [toolOpen, setToolOpen] = useState(false);
  // 直しかけがあるか（ダイアログが知らせる）と、押し直して閉じる確認を求めているか
  const [toolDirty, setToolDirty] = useState(false);
  const [toolCloseRequested, setToolCloseRequested] = useState(false);
  const closeTool = (): void => {
    setToolOpen(false);
    setToolDirty(false);
    setToolCloseRequested(false);
  };

  /** 押せるか・押せない理由（サーバーの事情 → 読み込み中の順に見る）。キャレットは各画面の決定が見る */
  const gate = (source: SourceState, action: string): { disabled: boolean; title: string } => {
    if (source.kind === 'unavailable') return { disabled: true, title: source.reason };
    if (source.kind === 'waiting') return { disabled: true, title: t('insertBar.waiting') };
    return { disabled: false, title: action };
  };
  const loraGate = gate(sources.lora, t('insertBar.lora.title'));
  const style = gate(sources.styles, t('insertBar.style.title'));
  const wildcard = gate(sources.wildcards, t('insertBar.wildcard.title'));
  const tagGate = gate(sources.tags, t('insertBar.tag.title'));

  return (
    // 間隔はカード列の脇のアイコンに揃える
    <div className="flex flex-col items-center gap-0.5" aria-label={t('insertBar.label')}>
      {/* 既定の使い方（閉じ込めない・取り込みは閉じない）。渡すのは値と手続きだけ */}
      <ModelPickerDialog
        folder={LORA_FOLDER}
        subtitle={t('insertBar.label')}
        // 開いている間に押し直すと閉じる（開け閉てはここが持つ）
        trigger={
          <button
            type="button"
            className={ICON_BUTTON}
            disabled={loraGate.disabled}
            // キャレットを欄から外さない（開いた瞬間の欄を差し込み先にする）
            onMouseDown={keepCaret}
            onClick={() => setLoraOpen(!loraOpen)}
            aria-label={t('insertBar.lora.label')}
            aria-expanded={loraOpen}
            title={loraGate.title}
          >
            <SourceIcon icon={BookSearch} source={sources.lora} />
          </button>
        }
        value=""
        open={loraOpen}
        onOpenChange={setLoraOpen}
        options={lora.options}
        index={lora.index}
        baseUrl={lora.baseUrl}
        loading={lora.loading}
        onRefresh={lora.onRefresh}
        placeBlocked={lora.placeBlocked}
        drag={lora.drag}
        onInsertText={lora.onInsertText}
        onPlace={lora.onPlace}
        finalFocus={lora.finalFocus}
        decideAside={lora.target === null ? <InsertCaretHandle /> : null}
      />
      {loraOpen && lora.target !== null ? <InsertCaretMarker field={lora.target} /> : null}

      {/* 既存の編集の画面を重ねて開く（ほかの埋め込みはダイアログの枠が閉じる）。
          開いている間に押し直すと閉じる（直しかけがあれば画面が確かめる） */}
      <button
        type="button"
        className={ICON_BUTTON}
        disabled={style.disabled}
        aria-label={t('insertBar.style.label')}
        aria-expanded={editingStyle}
        title={style.title}
        onMouseDown={keepCaret}
        onClick={() => {
          if (editingStyle) {
            requestCloseStyle();
            return;
          }
          openStyleEditor(firstStyle);
        }}
      >
        <SourceIcon icon={Brush} source={sources.styles} />
      </button>

      {/* ノードの上に重ねる一覧を開く（スタイルの編集と同じ作り）。開いている間に押し直すと閉じる */}
      <button
        type="button"
        className={ICON_BUTTON}
        disabled={wildcard.disabled}
        aria-label={t('insertBar.wildcard.label')}
        aria-expanded={wildcardsOpen}
        title={wildcard.title}
        onMouseDown={keepCaret}
        onClick={() => {
          if (wildcardsOpen) {
            closeWildcards();
            return;
          }
          openWildcards();
        }}
      >
        <SourceIcon icon={SquareAsterisk} source={sources.wildcards} />
      </button>

      {/* タグ辞書の画面（ワイルドカードと同じ作り）。開いている間に押し直すと閉じる（直しかけは画面が確かめる） */}
      <button
        type="button"
        className={ICON_BUTTON}
        disabled={tagGate.disabled}
        aria-label={t('insertBar.tag.label')}
        aria-expanded={tagPanelOpen}
        title={tagGate.title}
        onMouseDown={keepCaret}
        onClick={() => {
          if (tagPanelOpen) {
            requestCloseTags();
            return;
          }
          openTags();
        }}
      >
        <SourceIcon icon={WholeWord} source={sources.tags} />
      </button>

      {/* LLM からの呼び出し設定。開いている間に押し直すと閉じる */}
      <button
        type="button"
        className={ICON_BUTTON}
        disabled={!hasWorkflow}
        aria-label={t('insertBar.tool.label')}
        aria-expanded={toolOpen}
        title={t('insertBar.tool.title')}
        onClick={() => {
          // 開いている間に押し直すと閉じる。直しかけがあれば確かめる
          if (!toolOpen) setToolOpen(true);
          else if (toolDirty) setToolCloseRequested(true);
          else closeTool();
        }}
      >
        <Bot className={toolIcon({ set: toolSet })} aria-hidden />
      </button>
      {toolOpen ? (
        <WorkflowToolDialog
          open
          onClose={closeTool}
          closeRequested={toolCloseRequested}
          onCloseCanceled={() => setToolCloseRequested(false)}
          onDirtyChange={setToolDirty}
        />
      ) : null}
    </div>
  );
}
