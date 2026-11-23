import { cva } from 'class-variance-authority';
import { Check } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { startPlaybook } from '@/chat/playbook-outline';
import { playbookRows, type PlaybookRow } from '@/components/llm/playbook/use-playbook-manage';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

const chooserRow = cva(
  'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left',
  { variants: { chosen: { true: 'bg-muted', false: 'hover:bg-muted' } } },
);

export function PlaybookChooser({
  chatId,
  onChosen,
}: {
  readonly chatId: string;
  readonly onChosen: () => void;
}): React.ReactElement {
  const current = useChatStore(
    useShallow((state) => {
      const ref = state.chats[chatId]?.playbook;
      return ref === undefined ? null : { id: ref.id, origin: ref.origin };
    }),
  );
  const hidden = useSettingsStore((state) => state.playbooksHidden);
  const rows = playbookRows({});
  const chosen = (row: PlaybookRow): boolean =>
    current?.origin === row.origin && current.id === row.id;
  const shown = (list: readonly PlaybookRow[]): readonly PlaybookRow[] =>
    list.filter((row) => chosen(row) || !hidden.includes(row.key));

  const choose = (row: PlaybookRow): void => {
    const store = useChatStore.getState();
    const chat = store.chats[chatId];
    if (!chosen(row) && chat !== undefined) {
      store.setPlaybook(chatId, startPlaybook(chat, row.playbook()));
    }
    onChosen();
  };

  const group = (
    label: string,
    list: readonly PlaybookRow[],
    empty: string,
  ): React.ReactElement => (
    <section className="flex flex-col gap-1" aria-label={label}>
      <h3 className="text-muted-foreground px-2 text-xs">{label}</h3>
      {list.length === 0 ? (
        <p className="text-muted-foreground px-2 text-xs">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map((row) => (
            <li key={row.key} className="relative">
              <button
                type="button"
                className={chooserRow({ chosen: chosen(row) })}
                aria-current={chosen(row) ? 'true' : undefined}
                onClick={() => choose(row)}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {row.name}
                  {chosen(row) ? (
                    <>
                      <Check className="size-3.5" aria-hidden />
                      <span className="sr-only">{t('llm.playbook.chosen')}</span>
                    </>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">{row.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 py-2">
      {group(t('llm.playbook.builtinGroup'), shown(rows.builtin), t('llm.playbook.allHidden'))}
    </div>
  );
}
