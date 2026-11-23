import { cva } from 'class-variance-authority';
import { Database, Loader2, X } from 'lucide-react';

import { CopyButton } from '@/components/ui/copy-button';
import { InsertIconButton } from '@/components/ui/insert-icon-button';
import { LORA_FOLDER, modelNameOf, modelTypeOf } from '@/graph/model-files';
import type { ModelItem } from '@/graph/model-files';
import type { ModelInfo } from '@/graph/model-metadata';
import { useModelMetadata, type ModelMetadataState } from '@/hooks/flow/use-model-metadata';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { formatBytes } from '@/lib/text';

import { INFO_SECTION_CLASS, InfoHeading } from './InfoHeading';
import { ModelJson } from './ModelJson';
import { ModelNotes, type InfoInsert } from './ModelNotes';
import { ModelPreview } from './ModelPreview';

type ModelInfoLayout = 'stack' | 'wide';

export interface ModelInfoPanelProps {
  readonly item: ModelItem;
  readonly folder: string;
  readonly layout?: ModelInfoLayout | undefined;
  readonly leading?: React.ReactNode | undefined;
  readonly actions?: React.ReactNode | undefined;
  readonly insert?: InfoInsert | undefined;
  readonly preview?: { readonly baseUrl: string } | undefined;
  readonly onClose: () => void;
}

const ROWS_CLASS = 'space-y-1';

const LONG_VALUE = 48;

const entries = cva('mt-1', {
  variants: {
    layout: {
      stack: 'space-y-1',
      wide: 'grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-x-6 gap-y-1',
    },
  },
});

const entry = cva('', {
  variants: {
    layout: { stack: '', wide: 'flex min-w-0 gap-2' },
    long: { true: '', false: '' },
  },
  compoundVariants: [{ layout: 'wide', long: true, className: 'col-span-full' }],
});

const entryKey = cva('text-muted-foreground break-all', {
  variants: { layout: { stack: '', wide: 'w-40 shrink-0' } },
});

interface RowProps {
  readonly label: string;
  readonly value: string;
  readonly actions?: React.ReactNode;
  readonly children?: React.ReactNode;
}

function Row({ label, value, actions, children }: RowProps): React.ReactElement | null {
  if (value.length === 0) return null;

  return (
    <div>
      <div className="flex min-w-0 items-center gap-1">
        <span className="text-muted-foreground min-w-0 break-all">{label}</span>
        {actions}
      </div>
      {children ?? <div className="min-w-0 break-all">{value}</div>}
    </div>
  );
}

export function ModelInfoPanel({
  item,
  folder,
  layout = 'stack',
  leading,
  actions,
  insert,
  preview,
  onClose,
}: ModelInfoPanelProps): React.ReactElement {
  const metadata = useModelMetadata(folder, item.value);
  const info = metadata.info;
  const embedded = info !== null && info.entries.length > 0 ? info : null;

  return (
    <aside
      aria-label={t('modelPicker.info.panel')}
      className="@container flex min-h-0 flex-1 flex-col overflow-y-auto text-xs"
    >
      <div className="bg-popover sticky top-0 flex h-10 shrink-0 items-center gap-2 border-b px-3">
        {leading}
        <h3 className="min-w-0 truncate font-semibold" title={item.path}>
          {item.label}
        </h3>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {actions}
          <button
            type="button"
            className="text-muted-foreground hover:bg-muted rounded p-1"
            aria-label={t('modelPicker.info.close')}
            onClick={onClose}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {preview === undefined ? null : (
          <ModelPreview key={item.value} item={item} folder={folder} baseUrl={preview.baseUrl} />
        )}
        <InfoSummary item={item} embedded={embedded} insert={insert} />
        <MetadataNote metadata={metadata} hasEmbedded={embedded !== null} />
        {folder === LORA_FOLDER ? (
          <>
            <ModelJson
              key={`json:${item.value}`}
              folder={folder}
              filename={item.value}
              insert={insert}
            />
            <ModelNotes
              key={`txt:${item.value}`}
              folder={folder}
              filename={item.value}
              insert={insert}
            />
          </>
        ) : null}
        <MetadataSection item={item} embedded={embedded} layout={layout} />
      </div>
    </aside>
  );
}

interface InfoSummaryProps {
  readonly item: ModelItem;
  readonly embedded: ModelInfo | null;
  readonly insert: InfoInsert | undefined;
}

function InfoSummary({ item, embedded, insert }: InfoSummaryProps): React.ReactElement {
  const name = modelNameOf(item.value);
  const copyName = (
    <CopyButton
      iconOnly
      frameless
      text={name}
      label={t('modelPicker.info.copyName', { name: item.label })}
    />
  );
  return (
    <section className={ROWS_CLASS}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 [&>*]:shrink-0 [&>*:first-child]:min-w-0 [&>*:first-child]:flex-1">
        <Row label={t('modelPicker.info.name')} value={name} actions={copyName} />
        <Row label={t('modelPicker.info.type')} value={modelTypeOf(item)} />
        <Row label={t('modelPicker.info.baseModel')} value={embedded?.baseModel ?? ''} />
      </div>
      <TriggerWords words={embedded?.triggers ?? []} insert={insert} />
    </section>
  );
}

interface MetadataNoteProps {
  readonly metadata: ModelMetadataState;
  readonly hasEmbedded: boolean;
}

function MetadataNote({ metadata, hasEmbedded }: MetadataNoteProps): React.ReactElement {
  return (
    <>
      {metadata.status === 'loading' ? (
        <p className="text-muted-foreground flex items-center gap-2" role="status">
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          {t('modelPicker.info.loading')}
        </p>
      ) : null}
      {metadata.status === 'error' ? (
        <p className="text-destructive break-all">
          {t('modelPicker.info.error', { error: metadata.error ?? '' })}
        </p>
      ) : null}
      {metadata.info !== null && !hasEmbedded ? (
        <p className="text-muted-foreground">{t('modelPicker.info.noEmbedded')}</p>
      ) : null}
    </>
  );
}

interface TriggerWordsProps {
  readonly words: readonly string[];
  readonly insert: InfoInsert | undefined;
}

function TriggerWords({ words, insert }: TriggerWordsProps): React.ReactElement | null {
  const text = words.join(', ');
  const actions = (
    <>
      <CopyButton iconOnly frameless text={text} label={t('modelPicker.info.copyTriggerWords')} />
      {insert === undefined ? null : (
        <InsertIconButton
          label={t('modelPicker.info.insertTriggerWords')}
          blocked={insert.blocked}
          onInsert={() => insert.onInsert(text)}
        />
      )}
    </>
  );
  return (
    <Row label={t('modelPicker.info.triggerWords')} value={text} actions={actions}>
      <ul className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
        {words.map((word) => (
          <li key={word} className="bg-muted rounded-full px-2 py-0.5">
            {word}
          </li>
        ))}
      </ul>
    </Row>
  );
}

interface MetadataSectionProps {
  readonly item: ModelItem;
  readonly embedded: ModelInfo | null;
  readonly layout: ModelInfoLayout;
}

function MetadataSection({ item, embedded, layout }: MetadataSectionProps): React.ReactElement {
  return (
    <section className={INFO_SECTION_CLASS}>
      <InfoHeading icon={Database} label={t('modelPicker.info.allEntries')} />
      <div className={ROWS_CLASS}>
        <Row label={t('modelPicker.info.size')} value={formatBytes(item.file?.size ?? null)} />
        <Row
          label={t('modelPicker.info.created')}
          value={formatDateTime(item.file?.created ?? null)}
        />
        <Row
          label={t('modelPicker.info.modified')}
          value={formatDateTime(item.file?.modified ?? null)}
        />
        <Row label={t('modelPicker.info.network')} value={embedded?.network ?? ''} />
      </div>
      {embedded === null ? null : (
        <dl className={entries({ layout })}>
          {embedded.entries.map((field) => (
            <div
              key={field.key}
              className={entry({ layout, long: field.value.length > LONG_VALUE })}
            >
              <dt className={entryKey({ layout })}>{field.key}</dt>
              <dd className="min-w-0 break-all">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
