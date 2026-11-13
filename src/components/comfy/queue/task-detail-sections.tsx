import { cva } from 'class-variance-authority';
import { Fragment } from 'react';

import { CopyButton } from '@/components/ui/copy-button';
import { t, type MessageKey } from '@/i18n';
import { EMPTY_MARK, formatDuration } from '@/i18n/format';
import {
  MODEL_KINDS,
  ROLE_LABEL,
  type ModelGroups,
  type ModelKind,
  type TaskNodeRow,
  type TaskPrompt,
} from '@/queue/task-detail';
import { type NodeLabeler } from '@/queue/task-failure';

// ─────────────────────────────
// 実行内容の段（モデル・プロンプト・設定）。タスクの詳細・履歴の詳細・画像のタブが同じ見た目で使う。
// ─────────────────────────────

/** プロンプトの役（肯定・否定）の札 */
const roleBadge = cva('shrink-0 rounded px-1 text-3xs', {
  variants: {
    role: {
      positive: 'bg-slot-conditioning/20 text-slot-conditioning',
      negative: 'bg-destructive/15 text-destructive',
    },
  },
});
/** ノード 1 つの値の並び。順番の付いた行は番号の幅だけ下げる */
const nodeValues = cva('flex flex-wrap gap-x-3', {
  variants: { ordered: { true: 'pl-7', false: '' } },
});

/** 見出しの付いた段 1 つ */
export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="min-w-0">
      <h3 className="text-muted-foreground mb-1 text-2xs font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/**
 * プロンプトの出どころ。**実行した内容そのもの**から示す（開いているカードとは限らない）。
 * ノードは投げた時点のカードの表記で示す（控えが無ければ id とクラス名）
 */
function promptLabel(prompt: TaskPrompt, label: NodeLabeler): string {
  return `${label(prompt.nodeId, prompt.classType)} / ${prompt.inputName}`;
}

/** 空の段の印 */
const EMPTY_SECTION = <p className="text-muted-foreground">{EMPTY_MARK}</p>;

/** 使ったモデルを区分に分けずに並べる段 */
export function ModelsSection({
  models,
}: {
  readonly models: readonly string[];
}): React.ReactElement {
  return (
    <Section title={t('queue.detail.section.models')}>
      {models.length === 0 ? (
        EMPTY_SECTION
      ) : (
        <ul className="flex flex-col gap-0.5">
          {models.map((model) => (
            <li key={model} className="truncate" title={model}>
              {model}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** 区分の見出し */
const KIND_LABEL: Readonly<Record<ModelKind, MessageKey>> = {
  model: 'history.detail.kindModel',
  lora: 'history.detail.kindLora',
  other: 'history.detail.kindOther',
};

/**
 * モデルを区分（モデル・LoRA・その他）ごとの段で出す。無い区分は出さない
 */
export function ModelGroupsSection({
  models,
  compact = false,
}: {
  readonly models: ModelGroups | null;
  /** 区分の間を空けない（履歴の詳細で使う） */
  readonly compact?: boolean | undefined;
}): React.ReactElement {
  const kinds = MODEL_KINDS.filter((kind) => (models?.[kind].length ?? 0) > 0);
  if (models === null || kinds.length === 0) {
    return <Section title={t('queue.detail.section.models')}>{EMPTY_SECTION}</Section>;
  }
  const Wrapper = compact ? CompactKinds : Fragment;
  return (
    <Wrapper>
      {kinds.map((kind) => (
        <Section key={kind} title={t(KIND_LABEL[kind])}>
          <ul className="flex flex-col gap-0.5">
            {models[kind].map((file) => (
              <li key={file} className="truncate" title={file}>
                {file}
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </Wrapper>
  );
}

/** 区分を間を空けずに積む（親の段の間隔を区分どうしには入れない） */
function CompactKinds({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <div className="flex min-w-0 flex-col">{children}</div>;
}

/** プロンプトの段の受け取り物 */
export interface PromptsSectionProps {
  readonly prompts: readonly TaskPrompt[];
  readonly label: NodeLabeler;
  /** ノードの表記の横に、文章を写し取るアイコンを置く（履歴の詳細で使う） */
  readonly copyable?: boolean | undefined;
}

/** 実行したプロンプトを、出どころのノードと正負の印を添えて並べる段 */
export function PromptsSection({
  prompts,
  label,
  copyable = false,
}: PromptsSectionProps): React.ReactElement {
  return (
    <Section title={t('queue.detail.section.prompts')}>
      {prompts.length === 0 ? (
        EMPTY_SECTION
      ) : (
        <ul className="flex flex-col gap-2">
          {prompts.map((prompt) => (
            <li key={`${prompt.nodeId}.${prompt.inputName}`}>
              <span className="flex items-baseline gap-1.5">
                {prompt.role === null ? null : (
                  <span className={roleBadge({ role: prompt.role })}>
                    {t(ROLE_LABEL[prompt.role])}
                  </span>
                )}
                <span className="text-muted-foreground min-w-0 truncate">
                  {promptLabel(prompt, label)}
                </span>
                {copyable ? (
                  <CopyButton
                    iconOnly
                    frameless
                    className="self-center"
                    text={prompt.text}
                    label={t('history.detail.copyPrompt')}
                  />
                ) : null}
              </span>
              <p className="mt-0.5 whitespace-pre-wrap">{prompt.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** 設定の段の受け取り物 */
export interface SettingsSectionProps {
  readonly rows: readonly TaskNodeRow[];
  /** ノードの時刻がある（この画面が見ていた実行） */
  readonly timed: boolean;
  readonly label: NodeLabeler;
}

/** 設定と所要時間の表（時刻があるものは実行順に並ぶ） */
export function SettingsSection({ rows, timed, label }: SettingsSectionProps): React.ReactElement {
  return (
    <Section
      title={timed ? t('queue.detail.section.settingsTimed') : t('queue.detail.section.settings')}
    >
      {rows.length === 0 ? (
        EMPTY_SECTION
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.nodeId}>
              <span className="flex items-baseline gap-1.5">
                {row.order === null ? null : (
                  <span className="text-muted-foreground w-6 shrink-0 tabular-nums">
                    {row.order}
                  </span>
                )}
                <span className="text-muted-foreground min-w-0 truncate">
                  {label(row.nodeId, row.classType)}
                </span>
                {row.order === null ? null : (
                  <span className="ml-auto shrink-0 tabular-nums">
                    {formatDuration(row.durationMs)}
                  </span>
                )}
              </span>
              <div className={nodeValues({ ordered: row.order !== null })}>
                {row.values.map((value) => (
                  <span key={value.name} className="tabular-nums">
                    <span className="text-muted-foreground">{value.name}:</span> {value.text}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
