import { Popover } from '@base-ui/react/popover';
import { FileText } from 'lucide-react';
import { useState } from 'react';

import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { rawText, type RawText } from '@/lib/raw-text';

// ─────────────────────────────
// ストレージの管理の生データのアイコン。押すとその 1 件の保存の中身を読み、ポップアップで出す。
// ─────────────────────────────

/** 生データのポップアップに出す長さの上限（文字） */
const RAW_LIMIT = 20_000;

/** 生データの読んだ結果。null はまだ読んでいない */
type RawState = RawText | 'loading' | 'failed' | null;

/** 生データのアイコンの props */
export interface RawButtonProps {
  readonly label: string;
  readonly load: () => Promise<unknown>;
}

/**
 * 生データのアイコン。押すとその 1 件の保存の中身を読み、ポップアップで出す（Base UI の Popover）。
 * アイコンは中身が書かれたドキュメントの形で、ブラウザの欄とバックアップの欄で同じ物。
 * 読んだ物は閉じるまで（ダイアログの中身を作り直すまで）持ち、読めなかったときは開くたびに読み直す
 */
export function RawButton({ label, load }: RawButtonProps): React.ReactElement {
  const [state, setState] = useState<RawState>(null);
  const read = (open: boolean): void => {
    if (!open || (state !== null && state !== 'failed')) return;
    setState('loading');
    load().then(
      (value) => setState(rawText(value, RAW_LIMIT)),
      () => setState('failed'),
    );
  };
  return (
    <Popover.Root onOpenChange={read}>
      <Popover.Trigger className={`${DIALOG_ICON_CLASS} shrink-0`} aria-label={label} title={label}>
        <FileText className="size-4" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} className="z-[60]">
          <Popover.Popup
            aria-label={label}
            className="bg-popover text-popover-foreground flex max-h-[60vh] w-[min(36rem,80vw)]
              flex-col gap-1 overflow-auto rounded-md border p-2 text-xs shadow-lg outline-none"
          >
            <span className="text-muted-foreground text-2xs">{label}</span>
            {rawContent(state)}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** 生データのポップアップの中身。読んでいる・読めなかったはその旨、読めたら本文（長ければ切った旨） */
function rawContent(state: RawState): React.ReactElement {
  if (state === null || state === 'loading') {
    return <p className="text-muted-foreground">{t('llm.storage.loading')}</p>;
  }
  if (state === 'failed') {
    return <p className="text-muted-foreground">{t('llm.storage.rawFailed')}</p>;
  }
  return (
    <>
      <pre className="font-mono text-2xs break-all whitespace-pre-wrap">{state.text}</pre>
      {state.truncated ? (
        <p className="text-muted-foreground text-2xs">
          {t('llm.storage.rawTruncated', { count: RAW_LIMIT })}
        </p>
      ) : null}
    </>
  );
}
