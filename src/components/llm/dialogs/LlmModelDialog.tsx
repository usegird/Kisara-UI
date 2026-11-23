import { cva } from 'class-variance-authority';
import { CalendarPlus, CaseSensitive, CircleDollarSign } from 'lucide-react';
import { useState } from 'react';

import { LlmModelInfo } from '@/components/llm/dialogs/LlmModelInfo';
import {
  DEFAULT_LLM_MODEL_SORT,
  sortModels,
  type LlmModelSort,
  type LlmModelSortKey,
} from '@/components/llm/dialogs/model-sort';
import { ModelRow } from '@/components/llm/dialogs/ModelRow';
import { arrowSelect } from '@/components/ui/arrow-select';
import { DecideButton, PaneCloseButton } from '@/components/ui/decide-button';
import { DialogFrame } from '@/components/ui/dialog';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { DirectoryList } from '@/components/ui/directory-list';
import { SearchField } from '@/components/ui/search-field';
import { SidePane } from '@/components/ui/side-pane';
import { SortButtons, type SortOption } from '@/components/ui/sort-buttons';
import { t } from '@/i18n';
import { directoryTree, isUnderDirectory, splitPath } from '@/lib/path-tree';
import { matchesAllTerms, rankBySearch, searchTerms } from '@/lib/search-terms';
import { isComposingKey } from '@/lib/text-entry';
import type { ModelDetails } from '@/port/llm-port';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';

const modelButton = cva(
  'hover:bg-background/60 max-w-48 truncate rounded-md px-2 py-1 text-right text-xs',
  {
    variants: {
      attention: {
        true: 'text-tool-active ring-tool-active ring-1 ring-inset',
        false: '',
      },
    },
  },
);

const placeholderText = cva('', {
  variants: { attention: { true: 'text-tool-active', false: 'text-muted-foreground' } },
});

export interface LlmModelButtonProps {
  readonly profileId: string | null;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly attention?: boolean;
}

export function LlmModelButton({
  profileId,
  value,
  onValueChange,
  open,
  onOpenChange,
  attention = false,
}: LlmModelButtonProps): React.ReactElement {
  const [sort, setSort] = useState<LlmModelSort>(DEFAULT_LLM_MODEL_SORT);
  return (
    <>
      <button
        type="button"
        className={modelButton({ attention })}
        aria-label={
          value ? t('llm.modelPicker.open', { name: value }) : t('llm.modelPicker.placeholder')
        }
        title={value || t('llm.modelPicker.placeholder')}
        onClick={() => onOpenChange(true)}
      >
        {value || (
          <span className={placeholderText({ attention })}>{t('llm.modelPicker.placeholder')}</span>
        )}
      </button>
      <LlmModelDialog
        open={open}
        profileId={profileId}
        value={value}
        sort={sort}
        onSort={setSort}
        onClose={() => onOpenChange(false)}
        onDecide={(model) => {
          onValueChange(model);
          onOpenChange(false);
        }}
      />
    </>
  );
}

export interface LlmModelDialogProps {
  readonly open: boolean;
  readonly profileId: string | null;
  readonly value: string;
  readonly sort: LlmModelSort;
  readonly onSort: (sort: LlmModelSort) => void;
  readonly onClose: () => void;
  readonly onDecide: (model: string) => void;
}

export function LlmModelDialog({
  open,
  profileId,
  value,
  sort,
  onSort,
  onClose,
  onDecide,
}: LlmModelDialogProps): React.ReactElement {
  return (
    <DialogFrame
      id="llm-model"
      size="lg"
      movable
      embeddable={false}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('llm.modelPicker.title')}
    >
      {open ? (
        <PickerBody
          profileId={profileId}
          value={value}
          sort={sort}
          onSort={onSort}
          onDecide={onDecide}
          onClose={onClose}
        />
      ) : null}
    </DialogFrame>
  );
}

const NO_MODELS: readonly string[] = [];

function sortOptions(): SortOption<LlmModelSortKey>[] {
  return [
    { key: 'name', label: t('llm.modelPicker.sort.name'), Icon: CaseSensitive },
    { key: 'price', label: t('llm.modelPicker.sort.price'), Icon: CircleDollarSign },
    { key: 'created', label: t('llm.modelPicker.sort.created'), Icon: CalendarPlus },
  ];
}
const NO_DETAILS: Readonly<Record<string, ModelDetails>> = {};

function PickerBody({
  profileId,
  value,
  sort,
  onSort,
  onDecide,
  onClose,
}: Omit<LlmModelDialogProps, 'open'>): React.ReactElement {
  const models = useLlmProfilesStore((state) => {
    const check = profileId === null ? undefined : state.checks[profileId];
    return check?.kind === 'ok' ? check.models : NO_MODELS;
  });
  const detailsOf = useLlmProfilesStore((state) => {
    const check = profileId === null ? undefined : state.checks[profileId];
    return check?.kind === 'ok' ? check.details : NO_DETAILS;
  });
  const truncated = useLlmProfilesStore((state) => {
    const check = profileId === null ? undefined : state.checks[profileId];
    return check?.kind === 'ok' && check.truncated === true;
  });
  const [query, setQuery] = useState('');
  const [directory, setDirectory] = useState('');
  const [selected, setSelected] = useState<string | null>(value.length > 0 ? value : null);
  const [infoShown, setInfoShown] = useState(true);
  const details = selected === null ? undefined : detailsOf[selected];

  const directories = directoryTree(models.map((model) => splitPath(model).directory));
  const terms = searchTerms(query);
  const matched = sortModels(models, detailsOf, sort).filter(
    (model) =>
      isUnderDirectory(splitPath(model).directory, directory) && matchesAllTerms(model, terms),
  );
  const shown = rankBySearch(matched, query, (model) => ({
    names: [splitPath(model).label, model],
    texts: [model],
  }));
  const typed = query.trim();
  const custom = typed.length > 0 && !models.includes(typed) ? typed : null;
  const rows = custom === null ? shown : [custom, ...shown];

  const decide = (model: string | null): void => {
    if (model !== null && model.length > 0) onDecide(model);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <SidePane
        paneKey="llm-model:left"
        label={t('llm.modelPicker.directories')}
        side="left"
        toolbar={
          <DialogToolbar label={t('llm.modelPicker.decideToolbar')}>
            <DecideButton
              icon="set"
              label={t('llm.modelPicker.decide')}
              title={selected ?? t('llm.modelPicker.pickPrompt')}
              disabled={selected === null}
              onClick={() => decide(selected)}
            />
            <PaneCloseButton label={t('common.close')} onClick={onClose} />
          </DialogToolbar>
        }
      >
        <DirectoryList
          label={t('llm.modelPicker.directories')}
          total={models.length}
          directories={directories}
          selected={directory}
          onSelect={setDirectory}
        />
      </SidePane>

      <div className="flex min-w-0 flex-1 flex-col text-xs">
        <DialogToolbar label={t('llm.modelPicker.filterToolbar')}>
          <div
            className="contents"
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || isComposingKey(event)) return;
              event.preventDefault();
              decide(selected ?? rows[0] ?? null);
            }}
          >
            <SearchField
              value={query}
              onChange={setQuery}
              label={t('llm.modelPicker.filterLabel')}
              placeholder={t('llm.modelPicker.filterPlaceholder')}
            />
          </div>
          <SortButtons
            options={sortOptions()}
            sortKey={sort.key}
            ascending={sort.ascending}
            onSort={(key, ascending) => onSort({ key, ascending })}
          />
        </DialogToolbar>

        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-1">
            {truncated && (
              <p className="text-muted-foreground p-2">{t('llm.modelPicker.truncated')}</p>
            )}
            {rows.length === 0 ? (
              <p className="text-muted-foreground p-2">
                {t(models.length === 0 ? 'llm.modelPicker.noModels' : 'llm.modelPicker.noMatch')}
              </p>
            ) : (
              <ul
                aria-label={t('llm.modelPicker.list')}
                onKeyDown={(event) => arrowSelect(event, 'list')}
              >
                {rows.map((model) => (
                  <li key={model === custom ? `custom:${model}` : model}>
                    <ModelRow
                      model={model}
                      custom={model === custom}
                      details={detailsOf[model]}
                      showDirectory={directory === ''}
                      selected={model === selected}
                      onSelect={() => {
                        setSelected(model);
                        setInfoShown(true);
                      }}
                      onDecide={() => decide(model)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!infoShown || selected === null || details === undefined ? null : (
            <SidePane
              paneKey="llm-model:info"
              label={t('llm.modelPicker.info.title')}
              side="right"
              defaultSize={320}
            >
              <LlmModelInfo
                model={selected}
                details={details}
                onClose={() => setInfoShown(false)}
              />
            </SidePane>
          )}
        </div>
      </div>
    </div>
  );
}
