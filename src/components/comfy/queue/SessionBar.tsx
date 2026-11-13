import { SkipForward } from 'lucide-react';

import { t } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { activeSession, useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// セッションの帯。開いているワークフローのタブのセッション名を直し、次のセッションへ切り替える。
// ─────────────────────────────

/** タスクのタブの最上部に置くセッションの帯 */
export function SessionBar(): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const session = useTabsStore(activeSession);
  const activeId = useTabsStore((state) => state.activeId);
  const renewSession = useTabsStore((state) => state.renewSession);
  const recording = useSettingsStore((state) => state.recordRunHistory);
  const sessionName = useRunHistoryStore((state) => state.sessionName);
  const setSessionName = useRunHistoryStore((state) => state.setSessionName);

  return (
    <div className="flex items-center gap-1 px-1">
      {/* 書いてある名前・セッションが変わったら欄を作り直す（打ちかけは捨てる） */}
      <input
        key={`${session ?? ''}:${sessionName}`}
        type="text"
        className="border-input bg-background placeholder:text-muted-foreground h-6 min-w-0
          flex-1 rounded-md border px-2 text-2xs focus-visible:outline-2 disabled:opacity-60"
        aria-label={t('queue.session.name')}
        placeholder={session === null ? '' : t('queue.session.placeholder', { id: session })}
        title={recording ? t('queue.session.nameHint') : t('queue.session.off')}
        disabled={!recording || session === null}
        defaultValue={sessionName}
        onBlur={(event) => void setSessionName(baseUrl, event.currentTarget.value)}
        onKeyDown={(event) => {
          const key = entryKeyOf(event);
          if (key === 'commit') event.currentTarget.blur();
          if (key === 'cancel') {
            event.currentTarget.value = sessionName;
            event.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground hover:bg-muted -m-px rounded-md p-[5px]
          focus-visible:outline-2 disabled:opacity-50"
        aria-label={t('queue.session.rotate')}
        title={t('queue.session.rotateHint')}
        disabled={session === null}
        onClick={() => renewSession(activeId)}
      >
        <SkipForward className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
