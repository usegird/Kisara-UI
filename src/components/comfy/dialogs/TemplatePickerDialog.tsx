/* eslint-disable react-hooks/refs --
 * useIncrementalList が返すのは ref オブジェクトではなく「コールバック ref と件数」。
 * 描画中に .current を読んではいない（ModelPickerDialog と同じ）。
 */
import { cva } from 'class-variance-authority';
import { LayoutGrid, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { TemplateCard } from '@/components/comfy/dialogs/TemplateCard';
import { PaneCloseButton } from '@/components/ui/decide-button';
import { DialogFrame } from '@/components/ui/dialog';
import { dialogControl } from '@/components/ui/dialog-control';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { SearchField } from '@/components/ui/search-field';
import { SidePane } from '@/components/ui/side-pane';
import { builtinTemplateSection } from '@/graph/builtin-workflows';
import {
  allTemplates,
  filterTemplates,
  rankTemplates,
  sortTemplates,
  templateCategories,
  type TemplateSection,
  type TemplateSortKey,
  type WorkflowTemplate,
} from '@/graph/template-filter';
import { pickTemplateLocale, TEMPLATE_LOCALES } from '@/graph/template-locales';
import { useIncrementalList } from '@/hooks/ui/use-incremental-list';
import { t, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { CARD_LIST_STEP } from '@/store/settings-fields/card-size';

// ─────────────────────────────
// 同梱のワークフローテンプレートを選んで開くダイアログ。枠とキーボード操作は基盤に任せる。
// ─────────────────────────────

const SORT_LABELS: ReadonlyArray<{ readonly key: TemplateSortKey; readonly label: MessageKey }> = [
  { key: 'default', label: 'comfy.template.sort.default' },
  { key: 'popular', label: 'comfy.template.sort.popular' },
  { key: 'newest', label: 'comfy.template.sort.newest' },
  { key: 'name', label: 'comfy.template.sort.name' },
  { key: 'size', label: 'comfy.template.sort.size' },
];

const CHOICE_CLASS = cn(dialogControl({ kind: 'choice' }), 'py-1');

const categoryButton = cva(
  'hover:bg-accent flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs',
  { variants: { selected: { true: 'bg-accent', false: '' } } },
);

type Loaded =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly sections: readonly TemplateSection[];
      /** 訳が取れず英語に落としたか */
      readonly fellBack: boolean;
    }
  | { readonly kind: 'error'; readonly message: string };

/** テンプレートを選ぶダイアログの props */
export interface TemplatePickerDialogProps {
  /** 出しているか。開いたときに一覧を 1 回だけ取る */
  readonly open: boolean;
  /** 一覧とサムネイルを取る接続先 */
  readonly baseUrl: string;
  /** 選んだテンプレートを開く */
  readonly onSelect: (template: WorkflowTemplate) => void;
  /** 閉じる */
  readonly onClose: () => void;
}

/** テンプレートをカテゴリ・語・並び替え・言語で絞り、カードの格子から選ばせる */
export function TemplatePickerDialog({
  open,
  baseUrl,
  onSelect,
  onClose,
}: TemplatePickerDialogProps): React.ReactElement {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [category, setCategory] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<TemplateSortKey>('default');
  // 初めはブラウザの言語。選び直した言語は端末に残さない（読み込み直すまで保つ）
  const [locale, setLocale] = useState(() =>
    pickTemplateLocale(typeof navigator === 'undefined' ? [] : navigator.languages),
  );

  // 開いたとき・言語を変えたときに 1 回だけ取る（自動更新はしない）
  useEffect(() => {
    if (!open) return;

    let alive = true;
    comfyPort()
      .workflows.listTemplates(baseUrl, locale)
      .then(({ sections, fellBack }) => {
        if (alive) setLoaded({ kind: 'ready', sections, fellBack });
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setLoaded({
          kind: 'error',
          message: formatComfyFailure(cause),
        });
      });

    return () => {
      alive = false;
    };
  }, [open, baseUrl, locale]);

  // 標準のワークフローは「すべて」の次の先頭のカテゴリ。接続先の一覧が取れなくても出す。
  // compiler はこの部品を飛ばす（描画中に ref を読むとみなされる）ので、下の memo は手で書く
  const sections = useMemo(
    () => [builtinTemplateSection(), ...(loaded.kind === 'ready' ? loaded.sections : [])],
    [loaded],
  );
  const categories = useMemo(() => templateCategories(sections), [sections]);
  const total = useMemo(() => allTemplates(sections).length, [sections]);
  // 言語を変えても見出しの並びは同じなので、カテゴリは位置のまま保つ。無ければ「すべて」
  const shownCategory = category !== null && category < sections.length ? category : null;
  const visible = useMemo(
    () =>
      rankTemplates(
        sortTemplates(filterTemplates(sections, { category: shownCategory, query }), sortKey),
        query,
      ),
    [sections, shownCategory, query, sortKey],
  );

  // 数百枚あるので少しずつ描く。絞り込みか並び順が変わったら先頭から数え直す
  const shown = useIncrementalList(
    visible.length,
    CARD_LIST_STEP,
    [locale, String(shownCategory), query, sortKey].join(' '),
  );

  return (
    <DialogFrame
      id="template-picker"
      movable
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="xl"
      title={t('comfy.template.title')}
      subtitle={
        loaded.kind === 'ready' && loaded.fellBack ? (
          <span role="status">{t('comfy.template.fellBack')}</span>
        ) : (
          t('comfy.template.subtitle')
        )
      }
      actions={
        // 一覧の言語。訳されるのは題名・説明・カテゴリ名だけ
        <select
          className={CHOICE_CLASS}
          value={locale}
          aria-label={t('comfy.template.localeLabel')}
          title={t('comfy.template.localeTitle')}
          onChange={(event) => {
            setLoaded({ kind: 'loading' });
            setLocale(event.target.value);
          }}
        >
          {TEMPLATE_LOCALES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.label}
            </option>
          ))}
        </select>
      }
    >
      <div className="flex min-h-0 flex-1">
        {/* 左: カテゴリ。先頭に「すべて」。本体との間の縦線は掴んで幅を変える */}
        <SidePane
          paneKey="template-picker:left"
          label={t('comfy.template.category')}
          side="left"
          // 左の列の帯: 右寄せの閉じる ×
          toolbar={
            <DialogToolbar label={t('comfy.template.toolbar')}>
              <PaneCloseButton label={t('comfy.template.close')} onClick={onClose} />
            </DialogToolbar>
          }
        >
          <nav
            aria-label={t('comfy.template.category')}
            className="min-h-0 flex-1 overflow-y-auto p-1"
          >
            <button
              type="button"
              className={categoryButton({ selected: shownCategory === null })}
              aria-pressed={shownCategory === null}
              onClick={() => setCategory(null)}
            >
              <LayoutGrid className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t('comfy.template.all')}</span>
              <span className="text-muted-foreground ml-auto tabular-nums">{total}</span>
            </button>
            {categories.map((entry) => (
              <button
                key={entry.index}
                type="button"
                className={categoryButton({ selected: shownCategory === entry.index })}
                aria-pressed={shownCategory === entry.index}
                onClick={() => setCategory(entry.index)}
              >
                <span className="truncate pl-5">{entry.title}</span>
                <span className="text-muted-foreground ml-auto tabular-nums">{entry.count}</span>
              </button>
            ))}
          </nav>
        </SidePane>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* 右の帯: 左寄せの絞り込みと並び替え */}
          <DialogToolbar label={t('comfy.template.filterToolbar')}>
            <SearchField
              autoFocus
              value={query}
              onChange={setQuery}
              label={t('comfy.template.filterLabel')}
              placeholder={t('comfy.template.filterPlaceholder')}
            />
            <select
              className={CHOICE_CLASS}
              value={sortKey}
              aria-label={t('comfy.template.sortLabel')}
              onChange={(event) => {
                const picked = SORT_LABELS.find((entry) => entry.key === event.target.value);
                setSortKey(picked?.key ?? 'default');
              }}
            >
              {SORT_LABELS.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {t(entry.label)}
                </option>
              ))}
            </select>
          </DialogToolbar>

          {/* 右: カードの格子 */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loaded.kind === 'error' ? (
              <p className="text-destructive p-4 text-center text-sm" role="alert">
                {t('comfy.template.loadFailed', { message: loaded.message })}
              </p>
            ) : null}
            {visible.length === 0 ? (
              loaded.kind === 'ready' ? (
                <p className={EMPTY_NOTICE_CLASS}>{t('comfy.template.empty')}</p>
              ) : null
            ) : (
              <>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
                  {visible.slice(0, shown.count).map((template) => (
                    <TemplateCard
                      key={template.name}
                      template={template}
                      baseUrl={baseUrl}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
                {/* 目印。見えたら次のまとまりを足す */}
                {shown.done ? null : (
                  <p
                    ref={shown.sentinelRef}
                    className="text-muted-foreground flex items-center justify-center gap-2 py-4
                          text-xs"
                    role="status"
                  >
                    <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
                    {t('comfy.template.loadingMore', {
                      shown: shown.count,
                      total: visible.length,
                    })}
                  </p>
                )}
              </>
            )}
            {/* 標準のワークフローは先に出し、接続先の一覧が届くまでその下で回して示す */}
            {loaded.kind === 'loading' ? (
              <p
                className="text-muted-foreground flex items-center justify-center gap-2 p-8
                      text-sm"
                role="status"
              >
                <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
                {t('comfy.template.loading')}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </DialogFrame>
  );
}
