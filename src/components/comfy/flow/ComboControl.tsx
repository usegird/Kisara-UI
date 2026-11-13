import { ImagePickerDialog } from '@/components/comfy/flow/dialogs/ImagePickerDialog';
import { ModelPickerDialog } from '@/components/comfy/flow/dialogs/ModelPickerDialog';
import { folderLabel } from '@/components/comfy/flow/model-folder-label';
import { ModelPickerField } from '@/components/comfy/flow/ModelPickerField';
import { widgetControl, type WidgetAppearance } from '@/components/comfy/flow/widget-style';
import type { Commit, WidgetControlProps } from '@/components/comfy/flow/WidgetControl';
import { matchModelFolder, type ModelFile } from '@/graph/model-files';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import { useImageUpload } from '@/hooks/comfy/use-image-upload';
import type { ModelFiles } from '@/hooks/flow/use-model-files';
import { t } from '@/i18n';
import { formatDisplayValue } from '@/i18n/format';
import { formatEditValue } from '@/lib/text';

// ─────────────────────────────
// 選択肢の欄（モデル・画像はダイアログから選ぶ）
// ─────────────────────────────

interface ComboControlProps {
  readonly row: NodeRowData;
  readonly current: unknown;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly models: ModelFiles;
  readonly onCommit: Commit;
  readonly onNeedOptions: WidgetControlProps['onNeedOptions'];
}

/** 選択肢。読み込む前・モデルのディレクトリ・ふつうの一覧の 3 つに分かれる */
export function ComboControl({
  row,
  current,
  placeholder,
  appearance,
  models,
  onCommit,
  onNeedOptions,
}: ComboControlProps): React.ReactElement {
  // 未入力なら、カード側の値を**薄く**出す（選ぶまではノードの設定が使われる）
  const empty = formatEditValue(current) === '';
  const asPlaceholder = empty && placeholder !== undefined;

  if (row.options === null) {
    return (
      <button
        type="button"
        className={widgetControl({ appearance, muted: asPlaceholder }, 'truncate text-left')}
        aria-label={t('flow.widget.loadOptionsLabel', { name: row.label })}
        onClick={() => onNeedOptions?.(row)}
        title={t('flow.widget.loadOptionsTitle')}
      >
        {asPlaceholder ? placeholder : formatDisplayValue(current)}
      </button>
    );
  }
  // 画像を読み込む選択肢は、画像のカードで選ぶ・アップロードする。
  // 判定は入力設定の `image_upload` だけで、ノード名では分岐しない
  if (row.imageUpload) {
    return (
      <ImageCombo
        row={row}
        options={row.options}
        current={current}
        placeholder={placeholder}
        appearance={appearance}
        onCommit={onCommit}
      />
    );
  }
  // モデルのディレクトリ（Lora・チェックポイント）を参照する選択肢は、カードで選ぶ。
  // 判定は選択肢と一覧の突き合わせだけで、ノード名では分岐しない
  const folder = matchModelFolder(row.options, models.indexes);
  const folderIndex = folder === null ? null : (models.indexes.get(folder) ?? null);

  if (folder !== null && folderIndex !== null) {
    return (
      <ModelCombo
        row={row}
        options={row.options}
        current={current}
        placeholder={placeholder}
        appearance={appearance}
        folder={folder}
        folderIndex={folderIndex}
        models={models}
        onCommit={onCommit}
      />
    );
  }
  return (
    <OptionSelect
      row={row}
      options={row.options}
      text={formatEditValue(current)}
      asPlaceholder={asPlaceholder}
      placeholder={placeholder}
      appearance={appearance}
      onCommit={onCommit}
    />
  );
}

interface ModelComboProps {
  readonly row: NodeRowData;
  readonly options: readonly unknown[];
  readonly current: unknown;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly folder: string;
  readonly folderIndex: ReadonlyMap<string, ModelFile>;
  readonly models: ModelFiles;
  readonly onCommit: Commit;
}

/**
 * モデルの選択肢。カードの欄から選択の画面を開く
 */
function ModelCombo({
  row,
  options,
  current,
  placeholder,
  appearance,
  folder,
  folderIndex,
  models,
  onCommit,
}: ModelComboProps): React.ReactElement {
  const empty = formatEditValue(current) === '';
  // 空は「未選択」と薄く出す（空のまま実行すると断られる）。
  // アプリ入力の列で未入力なら、カード側の値を出す
  const shown = pickerTextOf(current, empty, placeholder);
  return (
    <ModelPickerDialog
      // 既定は差し込みの形。パラメータ行は閉じ込め・書き込んで閉じる・残す名前を分ける
      dialogId="model-picker"
      modal
      placeMode="set"
      folder={folder}
      subtitle={row.label}
      trigger={
        <ModelPickerField
          label={row.label}
          kind={folderLabel(folder)}
          text={shown}
          muted={empty}
          appearance={appearance}
          // カードでは空にし、アプリ入力の列では未入力に戻す（どちらも値は空文字）
          onClear={empty ? undefined : () => onCommit(row, '')}
          clearLabel={t(
            placeholder === undefined ? 'flow.widget.clear' : 'flow.widget.resetToCard',
          )}
        />
      }
      value={formatEditValue(current)}
      options={options}
      index={folderIndex}
      baseUrl={models.baseUrl}
      loading={models.statusOf(folder) === 'loading'}
      onRefresh={() => models.refresh(folder)}
      // 決定した値をその行へ書き込む
      onPlace={(next) => {
        onCommit(row, next);
        return null;
      }}
    />
  );
}

interface ImageComboProps {
  readonly row: NodeRowData;
  readonly options: readonly unknown[];
  readonly current: unknown;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly onCommit: Commit;
}

/**
 * 画像の選択肢。カードの欄から画像の選択の画面を開く
 */
function ImageCombo({
  row,
  options,
  current,
  placeholder,
  appearance,
  onCommit,
}: ImageComboProps): React.ReactElement {
  // アップロードしたら、そのクラスの選択肢を取り直す（subgraph の中のノードなら中のクラス）
  const className = uploadClassOf(row.target);
  const upload = useImageUpload(className);
  const empty = formatEditValue(current) === '';
  const shown = pickerTextOf(current, empty, placeholder);
  return (
    <ImagePickerDialog
      subtitle={row.label}
      trigger={
        <ModelPickerField
          label={row.label}
          kind={t('imagePicker.kind')}
          text={shown}
          muted={empty}
          appearance={appearance}
          onClear={empty ? undefined : () => onCommit(row, '')}
          clearLabel={t(
            placeholder === undefined ? 'flow.widget.clear' : 'flow.widget.resetToCard',
          )}
        />
      }
      value={formatEditValue(current)}
      options={options}
      upload={upload}
      onPlace={(next) => onCommit(row, next)}
    />
  );
}

interface OptionSelectProps {
  readonly row: NodeRowData;
  readonly options: readonly unknown[];
  /** 今の値（編集用の文字） */
  readonly text: string;
  readonly asPlaceholder: boolean;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly onCommit: Commit;
}

/** ふつうの選択肢の一覧 */
function OptionSelect({
  row,
  options,
  text,
  asPlaceholder,
  placeholder,
  appearance,
  onCommit,
}: OptionSelectProps): React.ReactElement {
  // 選択肢に無い値は項目として足して出す。足さないとブラウザが先頭の選択肢を出し、
  // 送る値（保存された値）と見た目がずれる（例: 拡張の JS が書き換えた見出しの文字列）
  const stray = !asPlaceholder && !options.some((option) => formatEditValue(option) === text);

  return (
    <select
      className={widgetControl({ appearance, muted: asPlaceholder, invalid: stray })}
      value={text}
      aria-label={row.label}
      title={stray ? t('flow.widget.stray') : undefined}
      onChange={(event) => onCommit(row, event.target.value)}
    >
      {placeholder === undefined ? null : <option value="">{placeholder}</option>}
      {stray ? (
        <option value={text} className="text-destructive">
          {text === '' ? t('flow.widget.unselected') : text}
        </option>
      ) : null}
      {options.map((option) => (
        // 欄を赤にしても、開いた一覧の正しい項目は普通の色で出す
        <option
          key={formatEditValue(option)}
          value={formatEditValue(option)}
          className="text-foreground"
        >
          {formatEditValue(option)}
        </option>
      ))}
    </select>
  );
}

/** 選ぶ欄に出す文字。空は「未選択」と薄く出す（空のまま実行すると断られる）。代わりの文があればそれ */
function pickerTextOf(current: unknown, empty: boolean, placeholder: string | undefined): string {
  if (!empty) return formatDisplayValue(current);
  return placeholder ?? t('flow.widget.unselected');
}

/** アップロードした後に選択肢を取り直すクラス（subgraph の中のノードなら中のクラス） */
function uploadClassOf(target: ImageComboProps['row']['target']): string | null {
  if (target === null) return null;
  return target.kind === 'node' ? target.classType : target.innerClassType;
}
