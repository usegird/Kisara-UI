import { useState } from 'react';

import { ComboControl } from '@/components/comfy/flow/ComboControl';
import { TextControl } from '@/components/comfy/flow/TextControl';
import { widgetControl, type WidgetAppearance } from '@/components/comfy/flow/widget-style';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import { useModelFiles } from '@/hooks/flow/use-model-files';
import { formatDisplayValue } from '@/i18n/format';
import { formatEditValue } from '@/lib/text';

// ─────────────────────────────
// パラメータ 1 つ分の編集。カードとアプリ入力の列で共有する（同じ見た目・同じ書き込み経路にするため）。
// ─────────────────────────────

/** パラメータの欄の受け取り物 */
export interface WidgetControlProps {
  readonly row: NodeRowData;
  readonly onCommit?: ((row: NodeRowData, value: unknown) => void) | undefined;
  /** COMBO の選択肢が未取得のときに取りに行かせる */
  readonly onNeedOptions?: ((row: NodeRowData) => void) | undefined;
  /** 書き込み先はあるが、この場では編集させない（App Mode 対象のカード側表示） */
  readonly readOnly?: boolean | undefined;
  /**
   * 入力欄に出す値。省略すると `row.value` を使う。
   * App 列はカードとは別の値を持つのでここで差し替える。
   */
  readonly value?: unknown;
  /**
   * 未入力のときに薄く出す文字（App 列ではカード側の値を出す）。
   * 選択肢のときは「未入力」の項目としても出し、選び直せば元に戻せる。
   */
  readonly placeholder?: string | undefined;
  /** 入力欄の見た目。カードは下線だけ、アプリ入力の列は枠 */
  readonly appearance?: WidgetAppearance | undefined;
  /** 複数行の入力欄の高さ（px）。省略すると呼び出し元の枠に任せる */
  readonly height?: number | undefined;
}

/**
 * 型に合う欄でパラメータを編集する。編集できるかは `row.target`（書き込み先が決まっているか）で決まり、
 * App Mode の対象は target を落としてあるので、自動的に読み取り専用になる
 */
export function WidgetControl({
  row,
  onCommit,
  onNeedOptions,
  readOnly = false,
  value,
  placeholder,
  appearance = 'box',
  height,
}: WidgetControlProps): React.ReactElement {
  const current = value === undefined ? row.value : value;
  const [draft, setDraft] = useState(() => formatEditValue(current));
  // 値が外から変わったら（確定・取り込みでの上書き）、打ちかけを合わせる。
  // 欄は作り直さない: 作り直すと差し込み先として覚えた欄とキャレットの位置が失われる。
  // 打鍵中は確定しないので、入力の途中で合わせ直されることはない
  const [synced, setSynced] = useState(() => formatEditValue(current));
  if (formatEditValue(current) !== synced) {
    setSynced(formatEditValue(current));
    setDraft(formatEditValue(current));
  }
  // モデルの一覧は、選択肢を持つ COMBO が出たときだけ取りに行く。
  // 読み取り専用の欄でも取りに行く（ここで呼ぶので、編集できるかで変わらない）
  const models = useModelFiles(row.type === 'COMBO' && row.options !== null);
  const editable = !readOnly && row.target !== null && onCommit !== undefined;

  if (!editable) {
    return <ReadOnlyValue current={current} multiline={row.multiline} appearance={appearance} />;
  }
  if (row.type === 'BOOLEAN') {
    return <BooleanControl row={row} current={current} onCommit={onCommit} />;
  }
  if (row.type === 'COMBO') {
    return (
      <ComboControl
        row={row}
        current={current}
        placeholder={placeholder}
        appearance={appearance}
        models={models}
        onCommit={onCommit}
        onNeedOptions={onNeedOptions}
      />
    );
  }
  return (
    <TextControl
      row={row}
      current={current}
      draft={draft}
      onDraft={setDraft}
      placeholder={placeholder}
      appearance={appearance}
      height={height}
      onCommit={onCommit}
    />
  );
}

// ─────────────────────────────
// 型ごとの欄。状態（打ちかけ）とモデルの一覧の購読は `WidgetControl` が持ち、ここは描くだけ
// ─────────────────────────────

/** 行の値を書き戻す手続き */
export type Commit = (row: NodeRowData, value: unknown) => void;

interface ReadOnlyValueProps {
  readonly current: unknown;
  readonly multiline: boolean;
  readonly appearance: WidgetAppearance;
}

/** 編集できない欄。複数行のテキストは折り返して全文出す（ComfyUI 本家と同じ見え方） */
function ReadOnlyValue({ current, multiline, appearance }: ReadOnlyValueProps): React.ReactElement {
  if (multiline) {
    return (
      <span
        className={widgetControl(
          { appearance, multiline: true },
          'block resize-none whitespace-pre-wrap opacity-60',
        )}
      >
        {formatDisplayValue(current)}
      </span>
    );
  }
  return (
    <span className={widgetControl({ appearance }, 'block truncate opacity-60')}>
      {formatDisplayValue(current)}
    </span>
  );
}

interface BooleanControlProps {
  readonly row: NodeRowData;
  readonly current: unknown;
  readonly onCommit: Commit;
}

function BooleanControl({ row, current, onCommit }: BooleanControlProps): React.ReactElement {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={current === true}
        aria-label={row.label}
        onChange={(event) => onCommit(row, event.target.checked)}
      />
      {current === true ? 'ON' : 'OFF'}
    </label>
  );
}
