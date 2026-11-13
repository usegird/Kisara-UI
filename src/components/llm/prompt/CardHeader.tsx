import { cva } from 'class-variance-authority';
import { Play } from 'lucide-react';
import { useRef, useState } from 'react';

import { t } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';

// ─────────────────────────────
// プロンプトのタブの行の見出し（項目・印・プレフィル・Comfy Workflow の行で共通）。
// ─────────────────────────────

const summaryText = cva('min-w-0 flex-1 truncate font-normal text-muted-foreground', {
  variants: { struck: { true: 'line-through', false: '' } },
});

/** 見出しの名前。無効の項目は取り消し線を引く */
const labelText = cva('max-w-[60%] shrink-0 truncate font-medium', {
  variants: { struck: { true: 'line-through', false: '' } },
});

const triangle = cva('size-2.5 fill-current transition-transform', {
  variants: { open: { true: 'rotate-90', false: '' } },
});

// 見積もったトークン数は、どの項目も右端に揃える（操作の有無で位置を変えない）。右端の操作は
// 数の上に重ね、指したときと焦点があるときだけ、数を隠して出す
const ACTIONS = 'absolute top-1/2 right-0 flex -translate-y-1/2 items-center gap-1';
const tokenCount = cva('text-muted-foreground shrink-0 pr-1 tabular-nums', {
  variants: {
    covered: {
      true: 'group-focus-within/card:invisible group-hover/card:invisible',
      false: '',
    },
  },
});

/** 項目の見出しの行の props */
export interface CardHeaderProps {
  readonly label: string;
  readonly position: string | null;
  /** 見積もり。数か、打ちかけを購読する要素。無ければ undefined */
  readonly tokens: React.ReactNode;
  readonly open: boolean;
  readonly onToggle: () => void;
  /**
   * 名前を変える手続き（文面の項目だけ）。名前をダブルクリックか F2 でその場の欄にする。
   * 空にすると既定の名前に戻る
   */
  readonly onRename?: ((name: string) => void) | undefined;
  /** 名前の欄が空のときに薄く出す既定の名前 */
  readonly defaultLabel?: string | undefined;
  /** 名前の欄を開いた状態で出す（足したばかりの項目） */
  readonly startRenaming?: boolean | undefined;
  /** 名前の欄を閉じた（決めたかやめたかによらない） */
  readonly onRenameEnd?: (() => void) | undefined;
  /** 名前の右に 1 行で出す補足（本文の頭・出どころ）。開いている間は出さない */
  readonly summary: string;
  /** 右端の操作（無効にする・戻す・削除） */
  readonly actions?: React.ReactNode;
  /** 並べ替えの掴み。無ければ字下げしない */
  readonly grip?: React.ReactNode;
  /** 名前と補足に取り消し線を引く（無効の項目） */
  readonly struck?: boolean | undefined;
}

/** 掴み・開く三角と名前・補足・位置・見積もり・右端の操作 */
export function CardHeader({
  label,
  position,
  tokens,
  open,
  onToggle,
  summary,
  onRename,
  defaultLabel,
  startRenaming = false,
  onRenameEnd,
  actions,
  grip,
  struck = false,
}: CardHeaderProps): React.ReactElement {
  const [renaming, setRenaming] = useState(startRenaming);
  // Escape で閉じたときは、欄から離れても名前を変えない
  const cancelled = useRef(false);
  // 名前の欄を出したら 1 度だけ、今の名前を選んですぐ打ち替えられるようにする（再描画では選び直さない）
  const selected = useRef(false);
  const attachName = (element: HTMLInputElement | null): void => {
    if (element === null || selected.current) return;
    selected.current = true;
    element.focus();
    element.select();
  };
  return (
    <div className="relative flex min-w-0 items-center gap-1">
      {/* 掴みの無い項目は字下げせず、三角を掴みの列に置く */}
      {grip}
      {renaming && onRename !== undefined ? (
        // 名前を変えている間は、開く三角と補足の代わりに名前の欄を置く（ボタンの中に欄を入れない）
        <input
          // ダブルクリック・F2・⊕ で出したときだけ置くので、すぐ打てるよう名前を選んでおく
          ref={attachName}
          className="border-input bg-background min-w-0 flex-1 rounded-sm border px-1 font-medium"
          defaultValue={label === defaultLabel ? '' : label}
          placeholder={defaultLabel}
          aria-label={t('llm.prompt.rename')}
          onKeyDown={(event) => {
            const key = entryKeyOf(event);
            if (key === 'commit') event.currentTarget.blur();
            if (key === 'cancel') {
              cancelled.current = true;
              event.currentTarget.blur();
            }
          }}
          onBlur={(event) => {
            if (!cancelled.current) onRename(event.currentTarget.value.trim());
            cancelled.current = false;
            selected.current = false;
            setRenaming(false);
            onRenameEnd?.();
          }}
        />
      ) : (
        <button
          type="button"
          className="hover:bg-accent/50 flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1
            text-left"
          aria-expanded={open}
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key === 'F2' && onRename !== undefined) {
              event.preventDefault();
              setRenaming(true);
            }
          }}
        >
          <Play className={triangle({ open })} aria-hidden />
          <span
            className={labelText({ struck })}
            title={onRename === undefined ? undefined : t('llm.prompt.renameHint')}
            onDoubleClick={() => {
              if (onRename !== undefined) setRenaming(true);
            }}
          >
            {label}
          </span>
          {open || summary.length === 0 ? (
            <span className="flex-1" />
          ) : (
            <span className={summaryText({ struck })}>{summary}</span>
          )}
          {position === null ? null : (
            <span className="text-muted-foreground shrink-0 text-3xs">{position}</span>
          )}
          {tokens === undefined ? null : (
            <span className={tokenCount({ covered: actions !== undefined && actions !== null })}>
              {tokens}
            </span>
          )}
        </button>
      )}
      {actions === undefined || actions === null ? null : <div className={ACTIONS}>{actions}</div>}
    </div>
  );
}
