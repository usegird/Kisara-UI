import { cva } from 'class-variance-authority';
import { Loader2, X } from 'lucide-react';

import { CopyButton } from '@/components/ui/copy-button';
import { InsertIconButton } from '@/components/ui/insert-icon-button';
import { LORA_FOLDER } from '@/graph/model-files';
import type { ModelItem } from '@/graph/model-files';
import type { ModelInfo } from '@/graph/model-metadata';
import { useModelMetadata, type ModelMetadataState } from '@/hooks/flow/use-model-metadata';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { formatBytes } from '@/lib/text';

import { ModelNotes, type InfoInsert } from './ModelNotes';

// ─────────────────────────────
// モデルを選ぶダイアログで、選んでいるカードの情報を出す列。一覧から分かることと、
// モデルに埋め込まれた metadata を並べ、Lora だけメモを添える。
// ─────────────────────────────

/** 情報の組み方。`stack` は右に置いたとき、`wide` は下に置いたとき */
type ModelInfoLayout = 'stack' | 'wide';

/** モデルの情報の列の props */
export interface ModelInfoPanelProps {
  readonly item: ModelItem;
  /** 種別。埋め込み情報を引くのに要る */
  readonly folder: string;
  /** `stack` は右に置いたとき、`wide` は下に置いたとき */
  readonly layout?: ModelInfoLayout | undefined;
  /** 見出しの名前の左に置くもの（差し込みの取り込み） */
  readonly leading?: React.ReactNode | undefined;
  /** 見出しの × の左に置くもの（置き場の切り替え） */
  readonly actions?: React.ReactNode | undefined;
  /** 語・メモを外の欄へ入れる手続き。渡したときだけ取り込みのアイコンを出す */
  readonly insert?: InfoInsert | undefined;
  readonly onClose: () => void;
}

/**
 * 上段の 1 行。情報の幅が狭いとき（`@container` の 18rem 未満）は名前を 1 行に取り、値を次の行へ送る
 */
const ROW_LABEL_CLASS = 'text-muted-foreground w-20 shrink-0 @max-[18rem]:w-full';

/** 全項目の値がこれより長ければ、段組みにせず 1 行を通して使う（下に置いたとき） */
const LONG_VALUE = 48;

/** 上段（経路〜作成）。下に置いたときは 2 列 */
const summary = cva('', {
  variants: { layout: { stack: 'space-y-3', wide: 'grid grid-cols-2 gap-x-6 gap-y-3' } },
});

/** 全項目の並び。下に置いたときは幅に応じて段組み */
const entries = cva('', {
  variants: {
    layout: {
      stack: 'space-y-1',
      wide: 'grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-x-6 gap-y-1',
    },
  },
});

/** 全項目の 1 件。下に置いたときは名前と値を 1 行に並べ、長い値は 1 行を通して使う */
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

function Row({
  label,
  value,
  children,
}: {
  readonly label: string;
  readonly value: string;
  /** 値の右に置くもの（写し取り） */
  readonly children?: React.ReactNode;
}): React.ReactElement | null {
  if (value.length === 0) return null;

  return (
    <div className="flex flex-wrap items-start gap-x-2 py-0.5">
      <span className={ROW_LABEL_CLASS}>{label}</span>
      <span className="min-w-0 break-all">{value}</span>
      {children}
    </div>
  );
}

/** 選んでいるモデルの情報を見出し・上段・語・メモ・全項目の順に描く。× は選択を外す */
export function ModelInfoPanel({
  item,
  folder,
  layout = 'stack',
  leading,
  actions,
  insert,
  onClose,
}: ModelInfoPanelProps): React.ReactElement {
  const metadata = useModelMetadata(folder, item.value);
  const info = metadata.info;
  const embedded = info !== null && info.entries.length > 0 ? info : null;

  return (
    <aside
      aria-label={t('modelPicker.info.panel')}
      // 幅で組み方を変える（上段の名前と値を分ける）ので、幅を測る囲みにする
      className="@container flex min-h-0 flex-1 flex-col overflow-y-auto text-xs"
    >
      {/* 高さは操作の帯と揃える（右に置いたとき、隣の帯と下端が揃う） */}
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
        <InfoSummary item={item} embedded={embedded} layout={layout} />
        <MetadataNote metadata={metadata} hasEmbedded={embedded !== null} />
        {embedded === null ? null : <TriggerWords words={embedded.triggers} insert={insert} />}
        {/* 選んだモデルが変わったら key で作り直し、メモの打ちかけを捨てる */}
        {folder === LORA_FOLDER ? (
          <ModelNotes key={item.value} folder={folder} filename={item.value} insert={insert} />
        ) : null}
        {embedded === null ? null : <EmbeddedEntries entries={embedded.entries} layout={layout} />}
      </div>
    </aside>
  );
}

// ─────────────────────────────
// 情報の段。どれも受け取った値を描くだけ
// ─────────────────────────────

interface InfoSummaryProps {
  readonly item: ModelItem;
  /** 埋め込みの情報。無ければ null */
  readonly embedded: ModelInfo | null;
  readonly layout: ModelInfoLayout;
}

/** 上段。埋め込みの名称（一番上）と、一覧から分かること（経路・大きさ・日時）、埋め込みの土台・網 */
function InfoSummary({ item, embedded, layout }: InfoSummaryProps): React.ReactElement {
  // 名前の写し取りは、同じ文字を出している経路の右に置く
  const path = (
    <Row label={t('modelPicker.info.path')} value={item.path}>
      <CopyButton
        iconOnly
        frameless
        text={item.value}
        label={t('modelPicker.info.copyName', { name: item.label })}
      />
    </Row>
  );
  const fileRows = (
    <>
      <Row label={t('modelPicker.info.size')} value={formatBytes(item.file?.size ?? null)} />
      <Row
        label={t('modelPicker.info.modified')}
        value={formatDateTime(item.file?.modified ?? null)}
      />
      <Row
        label={t('modelPicker.info.created')}
        value={formatDateTime(item.file?.created ?? null)}
      />
    </>
  );
  // 名称は一番上に置く
  const nameRow =
    embedded === null ? null : (
      <Row label={t('modelPicker.info.name')} value={embedded.title ?? ''} />
    );
  const embeddedRows =
    embedded === null ? null : (
      <>
        <Row label={t('modelPicker.info.baseModel')} value={embedded.baseModel ?? ''} />
        <Row label={t('modelPicker.info.network')} value={embedded.network ?? ''} />
      </>
    );

  if (layout === 'wide') {
    return (
      <div className={summary({ layout })}>
        <section>
          {nameRow}
          {path}
          {embeddedRows}
        </section>
        <section>{fileRows}</section>
      </div>
    );
  }
  return (
    <div className={summary({ layout })}>
      <section>
        {nameRow}
        {path}
        {fileRows}
        {embeddedRows}
      </section>
    </div>
  );
}

interface MetadataNoteProps {
  readonly metadata: ModelMetadataState;
  /** 埋め込みの項目が 1 つ以上ある */
  readonly hasEmbedded: boolean;
}

/**
 * 埋め込みの情報を読んでいる・読めなかった・無かったの一言
 * （無いのは普通なので失敗と書かない）
 */
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

/** 学習で多かった語。まとめて写せる・差し込める */
function TriggerWords({ words, insert }: TriggerWordsProps): React.ReactElement | null {
  if (words.length === 0) return null;
  const text = words.join(', ');
  return (
    <section>
      <div className="mb-1 flex items-center gap-1">
        <h4 className="text-muted-foreground font-semibold">
          {t('modelPicker.info.triggerWords')}
        </h4>
        <CopyButton iconOnly frameless text={text} label={t('modelPicker.info.copyTriggerWords')} />
        {insert === undefined ? null : (
          <InsertIconButton
            label={t('modelPicker.info.insertTriggerWords')}
            blocked={insert.blocked}
            onInsert={() => insert.onInsert(text)}
          />
        )}
      </div>
      {/* 高さはメモの欄（既定の高さ）と同じだけ。越えた分は並びの中で送る */}
      <ul className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
        {words.map((word) => (
          <li key={word} className="bg-muted rounded-full px-2 py-0.5">
            {word}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface EmbeddedEntriesProps {
  readonly entries: ModelInfo['entries'];
  readonly layout: ModelInfoLayout;
}

/** 埋め込みの全項目（こちらで絞らない。手掛かりが消えるため） */
function EmbeddedEntries({ entries: fields, layout }: EmbeddedEntriesProps): React.ReactElement {
  return (
    <section>
      <h4 className="text-muted-foreground mb-1 font-semibold">
        {t('modelPicker.info.allEntries')}
      </h4>
      <dl className={entries({ layout })}>
        {fields.map((field) => (
          <div key={field.key} className={entry({ layout, long: field.value.length > LONG_VALUE })}>
            <dt className={entryKey({ layout })}>{field.key}</dt>
            <dd className="min-w-0 break-all">{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
