import type { ParamDraft, ParamRow } from '@/components/shared/workflow-tool-draft';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { field } from '@/components/ui/field';
import type { ArgumentMode, OutputNode } from '@/graph/workflow-tool';
import { t, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// 呼び出し設定のダイアログの段（どのタブ・ファイルか・結果の出力ノード・引数 1 つの欄）。
// 打ちかけの値はダイアログが持ち、ここは描いて変えたことを知らせるだけ
// ─────────────────────────────

const MODES: readonly { readonly mode: ArgumentMode; readonly label: MessageKey }[] = [
  { mode: 'overwrite', label: 'comfy.tool.modeOverwrite' },
  { mode: 'prepend', label: 'comfy.tool.modePrepend' },
  { mode: 'append', label: 'comfy.tool.modeAppend' },
];

/** 見出しの下に出す、どのタブ・どのファイルの設定か */
export interface WorkflowToolPlace {
  /** タブの名前。タブを閉じていれば null */
  readonly tabName: string | null;
  /** タブの識別 ID（`tab-3` など）。タブを閉じていれば null */
  readonly tabId: string | null;
  /** ComfyUI に保存したパス。保存していなければ null */
  readonly path: string | null;
}

/**
 * どのタブ・どのファイルの設定か。1 行に左からタブ、ファイル名。見出しと値はほかの段の見出しと
 * 同じ大きさで出す
 */
export function PlaceInfo({ place }: { readonly place: WorkflowToolPlace }): React.ReactElement {
  const tab =
    place.tabName === null || place.tabId === null
      ? t('comfy.tool.tabClosed')
      : t('comfy.tool.tabWithId', { name: place.tabName, id: place.tabId });
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-3 text-sm">
      <dt>{t('comfy.tool.tab')}</dt>
      <dd className="text-muted-foreground truncate">{tab}</dd>
      <dt>{t('comfy.tool.file')}</dt>
      <dd className="text-muted-foreground truncate" title={place.path ?? undefined}>
        {place.path ?? t('comfy.tool.unsaved')}
      </dd>
    </dl>
  );
}

/**
 * 結果として渡す画像を出す出力ノードを選ぶ。先頭の「すべて」と個々のノードは連動する
 * （個々を入れると「すべて」が外れ、個々が無くなると「すべて」が入る。値が空なら「すべて」）。
 * 選んであっても今は出せないノード（無効・孤立）は、一覧に出さず選択も残す
 */
export function OutputChoice({
  nodes,
  labels,
  value,
  readOnly,
  onChange,
}: {
  readonly nodes: readonly OutputNode[];
  readonly labels: ReadonlyMap<number, string>;
  readonly value: readonly string[];
  readonly readOnly: boolean;
  readonly onChange: (value: readonly string[]) => void;
}): React.ReactElement {
  const toggle = (nodeId: string, on: boolean): void => {
    onChange(on ? [...value, nodeId] : value.filter((item) => item !== nodeId));
  };
  // 外すときは個々のノードを入れる（「すべて」だけを外して空にはしない）
  const onAllChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    if (event.target.checked) onChange([]);
  };
  return (
    <fieldset className="flex flex-col gap-1 text-sm" disabled={readOnly}>
      <legend className="mb-1">{t('comfy.tool.result')}</legend>
      {/* 「すべて」と出力ノードは横に並べ、入り切らなければ折り返す */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {nodes.length === 0 ? (
          <p className={EMPTY_NOTICE_CLASS}>{t('comfy.tool.noOutputs')}</p>
        ) : (
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={value.length === 0} onChange={onAllChange} />
            {t('comfy.tool.allOutputs')}
          </label>
        )}
        {nodes.map((node) => (
          <label key={node.nodeId} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={value.includes(node.nodeId)}
              onChange={(event) => toggle(node.nodeId, event.target.checked)}
            />
            {labels.get(Number(node.nodeId)) ?? node.nodeId}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 引数 1 つの欄（引数名・説明・入れ方）。引数にできない型は名前だけを薄く出す */
export function ParamFields({
  row,
  value,
  readOnly,
  onChange,
}: {
  readonly row: ParamRow;
  readonly value: ParamDraft;
  readonly readOnly: boolean;
  readonly onChange: (patch: Partial<ParamDraft>) => void;
}): React.ReactElement {
  if (!row.eligible) {
    return (
      <p className="text-muted-foreground text-xs" title={t('comfy.tool.notEligible')}>
        {row.label}
      </p>
    );
  }
  const onModeChange = (event: React.ChangeEvent<HTMLSelectElement>): void =>
    onChange({
      mode: MODES.find((item) => item.mode === event.target.value)?.mode ?? 'overwrite',
    });
  // 引数名を幅の 9 分の 2、その右に説明（残りの幅）、右端に入れ方
  return (
    <div className="grid grid-cols-9 gap-x-2 gap-y-1">
      <span className="col-span-9 truncate text-xs">{row.label}</span>
      <input
        className={cn(field({ size: 'xs', width: 'full' }), 'col-span-2')}
        aria-label={t('comfy.tool.paramName', { label: row.label })}
        placeholder={t('comfy.tool.paramNamePlaceholder')}
        readOnly={readOnly}
        value={value.name}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <div className="col-span-7 flex min-w-0 gap-2">
        <input
          className={cn(field({ size: 'xs', width: 'full' }), 'min-w-0')}
          aria-label={t('comfy.tool.paramDescription', { label: row.label })}
          placeholder={t('comfy.tool.paramDescriptionPlaceholder')}
          readOnly={readOnly}
          value={value.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        <select
          className={field({ size: 'xs' })}
          aria-label={t('comfy.tool.mode', { label: row.label })}
          // 足せない型は上書きに固定する
          disabled={readOnly || !row.mergeable}
          value={row.mergeable ? value.mode : 'overwrite'}
          onChange={onModeChange}
        >
          {MODES.map((item) => (
            <option key={item.mode} value={item.mode}>
              {t(item.label)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
