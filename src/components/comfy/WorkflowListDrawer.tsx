import { ExternalLink, FilePlus, FileUp, LayoutTemplate } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ColumnDivider } from '@/components/ui/column-divider';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { NAV_TOGGLE_MARK } from '@/components/ui/nav-toggle';
import { useSavedWorkflows } from '@/hooks/comfy/use-saved-workflows';
import { t, type MessageKey } from '@/i18n';
import { groupByPeriod, type ListPeriod } from '@/lib/list-period';
import { guardPress } from '@/lib/press-guard';
import { cn } from '@/lib/utils';
import type { SavedWorkflow } from '@/port/workflows';
import { useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore } from '@/store/use-settings-store';

const ROW = `flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left text-sm
  hover:bg-background/60 disabled:cursor-not-allowed disabled:opacity-40
  disabled:hover:bg-transparent`;

const ROW_ICON = `text-muted-foreground hover:text-foreground hover:bg-background absolute top-1/2
  right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded opacity-0
  group-focus-within/workflow:opacity-100 group-hover/workflow:opacity-100`;

const PERIOD_LABEL: Readonly<Record<ListPeriod, MessageKey>> = {
  today: 'llm.library.today',
  yesterday: 'llm.library.yesterday',
  week: 'llm.library.week',
  older: 'llm.library.older',
};

export interface WorkflowListDrawerProps {
  readonly baseUrl: string;
  readonly pinned: boolean;
  readonly onClose: () => void;
  readonly onOpenEmpty: () => void;
  readonly onOpenFile: () => void;
  readonly onOpenTemplate: () => void;
  readonly onOpenSaved: (workflow: SavedWorkflow, here: boolean) => void;
}

export function WorkflowListDrawer({
  baseUrl,
  pinned,
  onClose,
  onOpenEmpty,
  onOpenFile,
  onOpenTemplate,
  onOpenSaved,
}: WorkflowListDrawerProps): React.ReactElement {
  const connected = useConnectionStore((state) => state.status === 'connected');
  const { items, error } = useSavedWorkflows(connected, baseUrl);
  const width = useSettingsStore((state) => state.chatSidebarWidth);
  const resize = useSettingsStore((state) => state.resizeChatSidebar);
  const [now] = useState(() => Date.now());
  const root = useRef<HTMLElement>(null);
  const needsConnection = connected ? undefined : t('comfy.connection.needsConnection');
  const choose = (open: () => void): void => {
    onClose();
    open();
  };
  const onSavedClick = (item: SavedWorkflow, here: boolean): (() => void) =>
    guardPress('workflow-open-server', () => choose(() => onOpenSaved(item, here)));
  const groups = groupByPeriod(items ?? [], (item) => item.modified, now);

  useEffect(() => {
    if (pinned) return undefined;
    const onPointer = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(`[${NAV_TOGGLE_MARK}]`) !== null) return;
      if (root.current?.contains(event.target) !== true) onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned, onClose]);

  return (
    <nav
      ref={root}
      aria-label={t('comfy.list.label')}
      className="animate-in slide-in-from-left bg-background animation-duration-150 absolute inset-y-0
        left-0 z-30 flex flex-row pt-column-top pb-column-bottom pl-column-gutter shadow-lg
        motion-reduce:animate-none"
      style={{ width }}
    >
      <div className="bg-muted/60 mr-1 flex min-h-0 min-w-0 flex-1 flex-col rounded-md">
        <div className="flex flex-col p-1">
          <button
            type="button"
            className={ROW}
            disabled={!connected}
            title={needsConnection}
            onClick={() => choose(onOpenEmpty)}
          >
            <FilePlus className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t('comfy.connect.empty')}</span>
          </button>
          <button type="button" className={ROW} onClick={() => choose(onOpenFile)}>
            <FileUp className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t('comfy.connect.fromFile')}</span>
          </button>
          <button
            type="button"
            className={ROW}
            disabled={!connected}
            title={needsConnection}
            onClick={guardPress('workflow-template-dialog', () => choose(onOpenTemplate))}
          >
            <LayoutTemplate className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t('comfy.connect.fromTemplate')}</span>
          </button>
        </div>
        <div
          className="mt-2 min-h-0 flex-1 overflow-y-auto p-1"
          role="group"
          aria-label={t('comfy.list.saved')}
        >
          {!connected ? <p className={EMPTY_NOTICE_CLASS}>{needsConnection}</p> : null}
          {connected && (items === null || items.length === 0) ? (
            <p className={EMPTY_NOTICE_CLASS}>
              {error !== null
                ? t('comfy.open.loadFailed', { error })
                : t(items === null ? 'common.loading' : 'comfy.open.empty')}
            </p>
          ) : null}
          {connected
            ? groups.map((group) => (
                <section key={group.period} className="pb-2">
                  <h3 className="text-muted-foreground px-2 py-1 text-xs">
                    {t(PERIOD_LABEL[group.period])}
                  </h3>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.path} className="group/workflow relative">
                        <button
                          type="button"
                          className={cn(ROW, 'pr-8')}
                          title={item.path}
                          onClick={onSavedClick(item, true)}
                        >
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        </button>
                        <button
                          type="button"
                          className={ROW_ICON}
                          aria-label={t('llm.sidebar.openTabOf', { name: item.name })}
                          title={t('llm.sidebar.openTab')}
                          onClick={onSavedClick(item, false)}
                        >
                          <ExternalLink className="size-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            : null}
        </div>
      </div>
      <ColumnDivider
        column="workflowList"
        label={t('comfy.list.label')}
        width={width}
        onResize={(_, delta) => resize(delta)}
      />
    </nav>
  );
}
