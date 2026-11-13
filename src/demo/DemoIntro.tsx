import { X } from 'lucide-react';
import { useState } from 'react';

import { t } from '@/i18n';
import { safeStorage } from '@/lib/safe-storage';

// ─────────────────────────────
// 初めて開いたときの案内の帯。閉じたらこのブラウザに残し、次からは出さない
// （残せない環境では毎回出る）
// ─────────────────────────────

/** 閉じたことを残す名前 */
export const DEMO_INTRO_KEY = 'kisara.demo.introDismissed';

const storage = safeStorage();

function dismissedBefore(): boolean {
  try {
    return storage.getItem(DEMO_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

interface DemoIntroProps {
  /** 何を試すページかの一行も出す（見出しの帯に一行が無い狭い画面） */
  readonly withTagline: boolean;
}

/** 案内の帯。触り方と、閉じるボタンを出す */
export function DemoIntro({ withTagline }: DemoIntroProps): React.ReactElement | null {
  const [open, setOpen] = useState(() => !dismissedBefore());
  if (!open) return null;

  const close = (): void => {
    setOpen(false);
    try {
      void storage.setItem(DEMO_INTRO_KEY, '1');
    } catch {
      // 残せなくても閉じる
    }
  };

  return (
    <aside className="bg-muted/60 mx-4 mb-2 flex items-start gap-2 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1 text-sm">
        {withTagline ? <p className="font-medium">{t('demo.tagline')}</p> : null}
        <p className="text-muted-foreground text-xs">{t('demo.intro.body')}</p>
      </div>
      <button
        type="button"
        className="text-muted-foreground hover:bg-muted shrink-0 rounded p-1"
        aria-label={t('demo.intro.close')}
        title={t('demo.intro.close')}
        onClick={close}
      >
        <X className="size-4" aria-hidden />
      </button>
    </aside>
  );
}
