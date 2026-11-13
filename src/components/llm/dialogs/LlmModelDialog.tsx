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

// ─────────────────────────────
// 会話のモデルを選ぶダイアログと、入力欄の横の開くボタン。モデル名を `/` で区切ってディレクトリとして扱い、
// 作りはワイルドカードの画面と同じにする。
// ─────────────────────────────

/** モデルの欄。選ぶよう促す間は青い枠と青い字にする */
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

/** 未選択の字。促す間は枠と同じ青にする */
const placeholderText = cva('', {
  variants: { attention: { true: 'text-tool-active', false: 'text-muted-foreground' } },
});

/** 入力欄の横のモデルの欄の props */
export interface LlmModelButtonProps {
  readonly profileId: string | null;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** ダイアログを開いているか（送るボタンからも開くので、持つのは呼ぶ側） */
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** つながっていてモデルを選んでいない。欄を目立たせて選ぶ場所を示す */
  readonly attention?: boolean;
}

/** 入力欄の横のモデルの欄。選んだ名前を出し、押すとダイアログを開く */
export function LlmModelButton({
  profileId,
  value,
  onValueChange,
  open,
  onOpenChange,
  attention = false,
}: LlmModelButtonProps): React.ReactElement {
  // 並び替えはこのページを開いている間だけ持つ（端末に残さない）
  const [sort, setSort] = useState<LlmModelSort>(DEFAULT_LLM_MODEL_SORT);
  return (
    <>
      <button
        type="button"
        className={modelButton({ attention })}
        // 見えている文字を名前に含める（WCAG 2.5.3。音声で「モデルを選択」と言えば押せる）
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

/** モデルを選ぶダイアログの props */
export interface LlmModelDialogProps {
  readonly open: boolean;
  readonly profileId: string | null;
  /** 今のモデル（開いたときに選んでおく） */
  readonly value: string;
  readonly sort: LlmModelSort;
  readonly onSort: (sort: LlmModelSort) => void;
  readonly onClose: () => void;
  readonly onDecide: (model: string) => void;
}

/**
 * 接続の確かめで取ったモデルの一覧から選ぶダイアログ。絞り込みに打った名前が一覧に無ければ、それを使う
 * 行を先頭に出す
 */
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
      // ディレクトリと一覧を並べ、一覧を中で送るので、高さの決まった大きさにする
      size="lg"
      movable
      // 会話のタブには嵌める列が無いので、いつも自由移動で出す
      embeddable={false}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('llm.modelPicker.title')}
    >
      {/* 開くたびに今のモデル・すべて・空の絞り込みから始めたいので、中身は開いている間だけ置く */}
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

/** 並び替えの種類（形はモデルを選ぶ画面と同じ。文言は引くたびに今の言語で） */
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
  // モデルごとの付帯情報（返すサーバーだけ）。一覧の 2 行目と右の列に使う
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
  // 情報の列を出しているか（× で閉じ、行を選ぶとまた出す）
  const [infoShown, setInfoShown] = useState(true);
  const details = selected === null ? undefined : detailsOf[selected];

  const directories = directoryTree(models.map((model) => splitPath(model).directory));
  // 並び替えてから、左のディレクトリと語で絞る（語はすべて含むものだけ。AND）。入力があれば検索の順位の
  // 順にし、同じ順位どうしは並び替えの順を保つ（前方一致は名前か経路）
  const terms = searchTerms(query);
  const matched = sortModels(models, detailsOf, sort).filter(
    (model) =>
      isUnderDirectory(splitPath(model).directory, directory) && matchesAllTerms(model, terms),
  );
  const shown = rankBySearch(matched, query, (model) => ({
    names: [splitPath(model).label, model],
    texts: [model],
  }));
  // 打った名前が一覧に無ければ、それを使う行を先頭に出す
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

      {/* 帯は右の列の上まで通し、その下に一覧と情報の列を並べる（情報が並び替えに被らない） */}
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
              // 一覧は `ul` / `li`（role を付けた div より支援技術が確実に読む）
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

          {/* 情報は一覧の横に並べる（重ねると一覧のスクロールバーが隠れる） */}
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
