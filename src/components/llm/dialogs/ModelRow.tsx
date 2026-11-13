import { cva } from 'class-variance-authority';

import { formatPrices } from '@/components/llm/dialogs/model-price-text';
import { t } from '@/i18n';
import { splitPath } from '@/lib/path-tree';
import type { ModelDetails } from '@/port/llm-port';

// ─────────────────────────────
// 会話のモデルを選ぶダイアログの一覧の 1 行。
// ─────────────────────────────

/** 一覧の行。選んでいる行は地の色で示す。2 行目に費用を出すので縦に積む */
const row = cva('hover:bg-accent flex w-full flex-col rounded px-2 py-1 text-left', {
  variants: { selected: { true: 'bg-accent', false: '' } },
});

/** 一覧の 1 行。押すと選び、ダブルクリックか Enter で決める */
export function ModelRow({
  model,
  custom,
  details,
  showDirectory,
  selected,
  onSelect,
  onDecide,
}: {
  readonly model: string;
  /** 一覧に無い、打った名前を使う行 */
  readonly custom: boolean;
  /** 付帯情報（あれば 2 行目に費用を出す） */
  readonly details: ModelDetails | undefined;
  /** 「すべて」で見ているとき、どのディレクトリのものかを薄く添える */
  readonly showDirectory: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDecide: () => void;
}): React.ReactElement {
  const { directory, label } = splitPath(model);
  const prices = details === undefined ? '' : formatPrices(details.prices);
  return (
    <button
      type="button"
      className={row({ selected })}
      title={model}
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={onDecide}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onDecide();
      }}
    >
      {custom ? (
        <span className="truncate">{t('llm.modelPicker.useTyped', { name: model })}</span>
      ) : (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">{label}</span>
          {showDirectory && directory !== '' ? (
            <span className="text-muted-foreground truncate">{directory}</span>
          ) : null}
        </span>
      )}
      {/* 費用は 1 行に収まるだけ出し、はみ出た分は省く */}
      {prices.length === 0 ? null : (
        <span className="text-muted-foreground truncate tabular-nums">{prices}</span>
      )}
    </button>
  );
}
