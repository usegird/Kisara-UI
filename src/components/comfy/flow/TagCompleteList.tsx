import { cva } from 'class-variance-authority';
import { createPortal } from 'react-dom';

import { formatTagPriority } from '@/graph/tag-complete';
import type { TagComplete } from '@/hooks/flow/use-tag-complete';
import { t } from '@/i18n';

// ─────────────────────────────
// タグの候補の一覧。欄の焦点は動かさず、キャレットの行の下（収まらなければ上）に浮かせる。
// ─────────────────────────────

/** 一覧の高さの上限（px）。下に収まるかの判定にも使う */
const LIST_MAX_HEIGHT = 240;
/** キャレットの行と一覧の間（px） */
const GAP = 2;

const optionItem = cva('flex cursor-default items-baseline gap-3 rounded px-2 py-0.5', {
  variants: { active: { true: 'bg-accent text-accent-foreground', false: '' } },
});

interface TagCompleteListProps {
  readonly complete: TagComplete;
}

/** 候補を出しているときだけ一覧を描く。行を押すとそのタグを入れる（押しても欄の焦点を奪わない） */
export function TagCompleteList({ complete }: TagCompleteListProps): React.ReactElement | null {
  const { suggestions, listId, optionId, pick } = complete;
  if (suggestions === null) return null;

  const { caret, matches, active, word } = suggestions;
  const below = caret.bottom + GAP + LIST_MAX_HEIGHT <= globalThis.innerHeight;
  const placement = below
    ? { top: caret.bottom + GAP }
    : { bottom: globalThis.innerHeight - caret.top + GAP };

  return createPortal(
    <>
      <ul
        id={listId}
        role="listbox"
        aria-label={t('tagComplete.list')}
        className="bg-popover text-popover-foreground fixed z-50 max-h-60 min-w-40 overflow-y-auto
          rounded-md border p-1 text-xs shadow-md"
        style={{ left: caret.left, maxHeight: LIST_MAX_HEIGHT, ...placement }}
      >
        {matches.map((match, index) => (
          <li
            key={match.tag.key}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            ref={index === active ? attachActiveOption : undefined}
            className={optionItem({ active: index === active })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(index)}
          >
            <span className="min-w-0 flex-1 truncate">
              {match.alias === null ? (
                <Highlighted text={match.tag.entry.tag} word={word} />
              ) : (
                <>
                  <Highlighted text={match.alias} word={word} />
                  {' → '}
                  {match.tag.entry.tag}
                </>
              )}
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {formatTagPriority(match.tag.entry.priority)}
            </span>
          </li>
        ))}
      </ul>
      <span className="sr-only" aria-live="polite">
        {t('tagComplete.count', { count: matches.length })}
      </span>
    </>,
    globalThis.document.body,
  );
}

/** 語に当たった部分を太くする。`_` と空白、大小は区別せずに探す */
function Highlighted({ text, word }: { readonly text: string; readonly word: string }) {
  const at = normalize(text).indexOf(normalize(word).trim());
  if (at < 0) return <>{text}</>;
  const end = at + word.trim().length;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold">{text.slice(at, end)}</strong>
      {text.slice(end)}
    </>
  );
}

/** 選んだ行を一覧の見える範囲へ入れる。選ぶ行が変わると付け直されるので、キーで動かすたびに呼ばれる */
function attachActiveOption(option: HTMLLIElement | null): void {
  option?.scrollIntoView({ block: 'nearest' });
}

function normalize(text: string): string {
  return text.toLowerCase().replaceAll('_', ' ');
}
