import { Menu } from '@base-ui/react/menu';
import { MoreHorizontal } from 'lucide-react';

import { MENU_ITEM_CLASS } from '@/components/ui/menu-item';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

export function PlaybookRowMenu({
  name,
  own,
  className,
  onCopy,
  onEdit,
  onRemove,
}: {
  readonly name: string;
  readonly own: boolean;
  readonly className: string;
  readonly onCopy: () => void;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}): React.ReactElement {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={className}
        aria-label={t('llm.playbook.menu', { name })}
        title={t('llm.playbook.menu', { name })}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50 outline-none" side="left" align="start" sideOffset={4}>
          <Menu.Popup
            className="bg-popover text-popover-foreground min-w-36 rounded-md border p-1 text-sm
              shadow-md outline-none"
          >
            <Menu.Item className={MENU_ITEM_CLASS} onClick={onCopy}>
              {t('llm.playbook.copy')}
            </Menu.Item>
            {own ? (
              <>
                <Menu.Item className={MENU_ITEM_CLASS} onClick={onEdit}>
                  {t('llm.playbook.edit')}
                </Menu.Item>
                <Menu.Item className={cn(MENU_ITEM_CLASS, 'text-destructive')} onClick={onRemove}>
                  {t('llm.playbook.delete')}
                </Menu.Item>
              </>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
