import { cva } from 'class-variance-authority';
import { Fragment } from 'react';

import { CopyButton } from '@/components/ui/copy-button';
import { t, type MessageKey } from '@/i18n';
import { EMPTY_MARK, formatDuration } from '@/i18n/format';
import type { OutputText } from '@/port/files';
import {
  MODEL_KINDS,
  ROLE_LABEL,
  type ModelGroups,
  type ModelKind,
  type TaskNodeRow,
  type TaskPrompt,
} from '@/queue/task-detail';
import { type NodeLabeler } from '@/queue/task-failure';

const roleBadge = cva('shrink-0 rounded px-1 text-3xs', {
  variants: {
    role: {
      positive: 'bg-slot-conditioning/20 text-slot-conditioning',
      negative: 'bg-destructive/15 text-destructive',
    },
  },
});
const nodeValues = cva('flex flex-wrap gap-x-3', {
  variants: { ordered: { true: 'pl-7', false: '' } },
});

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

function promptLabel(prompt: TaskPrompt, label: NodeLabeler): string {
  return `${label(prompt.nodeId, prompt.classType)} / ${prompt.inputName}`;
}

const EMPTY_SECTION = <p className="text-muted-foreground">{EMPTY_MARK}</p>;

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

const KIND_LABEL: Readonly<Record<ModelKind, MessageKey>> = {
  model: 'history.detail.kindModel',
  lora: 'history.detail.kindLora',
  other: 'history.detail.kindOther',
};

export function ModelGroupsSection({
  models,
  compact = false,
}: {
  readonly models: ModelGroups | null;
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

function CompactKinds({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <div className="flex min-w-0 flex-col">{children}</div>;
}

export interface PromptsSectionProps {
  readonly prompts: readonly TaskPrompt[];
  readonly label: NodeLabeler;
  readonly copyable?: boolean | undefined;
}

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

export interface OutputTextsSectionProps {
  readonly outputs: readonly { readonly text: OutputText; readonly classType: string | null }[];
  readonly label: NodeLabeler;
}

export function OutputTextsSection({
  outputs,
  label,
}: OutputTextsSectionProps): React.ReactElement | null {
  if (outputs.length === 0) return null;
  return (
    <Section title={t('queue.detail.section.outputTexts')}>
      <ul className="flex flex-col gap-2">
        {outputs.map(({ text, classType }) => {
          const joined = text.texts.join('\n');
          return (
            <li key={text.nodeId}>
              <span className="flex items-baseline gap-1.5">
                <span className="text-muted-foreground min-w-0 truncate">
                  {label(text.nodeId, classType)}
                </span>
                <CopyButton
                  iconOnly
                  frameless
                  className="self-center"
                  text={joined}
                  label={t('queue.detail.copyOutputText')}
                />
              </span>
              <p className="mt-0.5 break-all whitespace-pre-wrap">{joined}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export interface SettingsSectionProps {
  readonly rows: readonly TaskNodeRow[];
  readonly timed: boolean;
  readonly label: NodeLabeler;
}

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
