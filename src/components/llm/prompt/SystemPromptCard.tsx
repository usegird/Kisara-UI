import { Save, SaveAll, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { CardHeader } from '@/components/llm/prompt/CardHeader';
import { cardRow } from '@/components/llm/prompt/prompt-card-style';
import { ActionButton, LockMark } from '@/components/llm/prompt/PromptItemCard';
import { SystemPromptEditor } from '@/components/llm/prompt/PromptItemEditor';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { HistoryCombobox } from '@/components/ui/history-combobox';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';
import { useSystemPromptsStore } from '@/store/use-system-prompts-store';

// ─────────────────────────────
// KisaraUI のシステムプロンプトの、プロンプトのタブの読むだけの行と、パラメタのタブの先頭の直す欄。
// 全体の設定の 1 つで、どの会話にも効く。
// ─────────────────────────────

/** プロンプトのタブのシステムプロンプトの行の props */
export interface SystemPromptCardProps {
  readonly tokens: number | undefined;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** すぐ下の Comfy Workflow の行と地をつなげる（間に項目を入れられない） */
  readonly joinDown?: boolean | undefined;
}

/** プロンプトのタブの読むだけの 1 行。開くと本文を文字のまま出す */
export function SystemPromptCard({
  tokens,
  open,
  onToggle,
  joinDown = false,
}: SystemPromptCardProps): React.ReactElement | null {
  const content = useSettingsStore((state) => state.llmSystemPrompt);
  const selected = useSettingsStore((state) => state.llmSystemTemplate);
  const empty = content.trim().length === 0;
  return (
    <div className={cardRow({ enabled: !empty, dragging: false, locked: true, joinDown })}>
      <CardHeader
        label={t('llm.prompt.system')}
        // 縮めているときだけ、選んでいるテンプレートの名前を右に出す
        position={open ? null : (selected?.name ?? null)}
        tokens={empty ? undefined : tokens}
        summary={content.trim().split('\n')[0] ?? ''}
        open={open}
        onToggle={onToggle}
        grip={<LockMark />}
      />
      {open && !empty ? (
        <p className="px-1 pt-1 break-words whitespace-pre-wrap">{content}</p>
      ) : null}
    </div>
  );
}

/** パラメタのタブの先頭に置く、テンプレートの 1 行とシステムプロンプトの本文の欄 */
export function SystemPromptSettings(): React.ReactElement {
  const content = useSettingsStore((state) => state.llmSystemPrompt);
  const selected = useSettingsStore((state) => state.llmSystemTemplate);
  return (
    <div className="flex flex-col gap-1 pt-1 pl-1">
      <TemplateBar
        // 選んでいるテンプレートが替わったら、名前の欄を作り直す
        key={selected?.id ?? ''}
        content={content}
        selectedId={selected?.id ?? null}
      />
      <span className="text-muted-foreground mt-1">{t('llm.prompt.system')}</span>
      <SystemPromptEditor content={content} />
    </div>
  );
}

/** テンプレートを選ぶ・保存する・別名で保存する・消す 1 行 */
function TemplateBar({
  content,
  selectedId,
}: {
  readonly content: string;
  readonly selectedId: string | null;
}): React.ReactElement {
  const templates = useSystemPromptsStore((state) => state.templates);
  const current = selectedId === null ? undefined : templates[selectedId];
  // 打ちかけの名前はこの欄だけが持つ（選んでいるテンプレートが替わったら作り直す。呼び出し側の key）
  const [name, setName] = useState(current?.name ?? '');
  const [confirming, setConfirming] = useState(false);
  const list = Object.values(templates).sort((a, b) => a.name.localeCompare(b.name));
  const store = useSystemPromptsStore.getState;
  const settings = useSettingsStore.getState;
  const trimmed = name.trim();
  const renamed = current === undefined || trimmed !== current.name;

  const choose = (picked: string): void => {
    const template = list.find((item) => item.name === picked);
    if (template === undefined) return;
    // 本文も生成の設定も全体に写す（どの会話にも効く）
    settings().setLlmSystemPrompt(template.content);
    settings().setLlmSystemTemplate({ id: template.id, name: template.name });
    settings().setLlmParams(template.params);
  };
  const select = (template: { readonly id: string; readonly name: string }): void =>
    settings().setLlmSystemTemplate({ id: template.id, name: template.name });
  // 生成の設定は全体のもの。押したときに読む（欄を描き直すたびに購読しない）
  const params = () => settings().llmParams;
  const save = (): void => {
    if (trimmed.length === 0) return;
    if (current === undefined) {
      select(store().add(trimmed, content, params()));
      return;
    }
    store().update(current.id, content, params());
    if (renamed) {
      store().rename(current.id, trimmed);
      select({ id: current.id, name: trimmed });
    }
  };
  const saveAs = (): void => {
    if (trimmed.length === 0) return;
    const name =
      current !== undefined && !renamed ? t('llm.prompt.copyOf', { name: current.name }) : trimmed;
    const template = store().add(name, content, params());
    select(template);
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <HistoryCombobox
        className="min-w-0 flex-1 text-xs"
        value={name}
        onValueChange={setName}
        onPick={choose}
        onEnter={save}
        items={list.map((template) => template.name)}
        label={t('llm.prompt.template.choose')}
        placeholder={t('llm.prompt.template.name')}
      />
      <ActionButton
        label={
          current === undefined
            ? t('llm.prompt.template.saveAs')
            : t('llm.prompt.template.overwrite', { name: current.name })
        }
        visible
        disabled={trimmed.length === 0}
        onClick={save}
      >
        <Save className="size-3.5" aria-hidden />
      </ActionButton>
      <ActionButton
        label={t('llm.prompt.template.saveAsName')}
        visible
        disabled={trimmed.length === 0}
        onClick={saveAs}
      >
        <SaveAll className="size-3.5" aria-hidden />
      </ActionButton>
      <ActionButton
        label={
          current === undefined
            ? t('llm.prompt.template.removeTitle')
            : t('llm.prompt.template.remove', { name: current.name })
        }
        visible
        disabled={current === undefined}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </ActionButton>
      <ConfirmDialog
        open={confirming && current !== undefined}
        title={t('llm.prompt.template.removeTitle')}
        description={t('llm.prompt.template.removeDescription', { name: current?.name ?? '' })}
        confirmLabel={t('common.deleteConfirm')}
        onConfirm={() => {
          setConfirming(false);
          if (current === undefined) return;
          store().remove(current.id);
          // 本文は残し、テンプレートとのつながりだけ外す
          settings().setLlmSystemTemplate(null);
          setName('');
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
