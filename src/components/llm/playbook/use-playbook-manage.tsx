import { useState } from 'react';

import {
  BUILTIN_PLAYBOOKS,
  HELD_PLAYBOOK_IDS,
  resolvePlaybook,
  type Playbook,
} from '@/chat/playbook';
import {
  PlaybookEditorDialog,
  type PlaybookEditing,
} from '@/components/llm/playbook/PlaybookEditorDialog';
import { PlaybookRowMenu } from '@/components/llm/playbook/PlaybookRowMenu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { t, tPath } from '@/i18n';
import { usePlaybooksStore, type OwnPlaybook } from '@/store/use-playbooks-store';
import { useSettingsStore } from '@/store/use-settings-store';

export interface PlaybookRow {
  readonly key: string;
  readonly playbook: () => Playbook;
  readonly name: string;
  readonly description: string;
  readonly ownId: string | null;
  readonly id: string;
  readonly origin: Playbook['origin'];
}

export function playbookRows(own: Readonly<Record<string, OwnPlaybook>>): {
  readonly builtin: readonly PlaybookRow[];
  readonly mine: readonly PlaybookRow[];
} {
  const offered = BUILTIN_PLAYBOOKS.filter((shape) => !HELD_PLAYBOOK_IDS.includes(shape.id));
  const builtin = offered.map((shape): PlaybookRow => ({
    key: `builtin:${shape.id}`,
    playbook: () => resolvePlaybook(shape, tPath),
    name: tPath(`llm.playbook.builtin.${shape.id}.name`),
    description: tPath(`llm.playbook.builtin.${shape.id}.description`),
    ownId: null,
    id: shape.id,
    origin: 'builtin',
  }));
  const mine = Object.values(own)
    .toSorted((a, b) => a.createdAt - b.createdAt)
    .map((item): PlaybookRow => ({
      key: `own:${item.id}`,
      playbook: () => item.playbook,
      name: item.playbook.name,
      description: item.playbook.description,
      ownId: item.id,
      id: item.id,
      origin: 'own',
    }));
  return { builtin, mine };
}

interface PlaybookManage {
  readonly menu: (row: PlaybookRow, className: string) => React.ReactElement;
  readonly dialogs: React.ReactElement;
}

export function usePlaybookManage(): PlaybookManage {
  const [editing, setEditing] = useState<PlaybookEditing | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const menu = (row: PlaybookRow, className: string): React.ReactElement => (
    <PlaybookRowMenu
      name={row.name}
      own={row.ownId !== null}
      className={className}
      onCopy={() => setEditing({ kind: 'copy', source: row.playbook() })}
      onEdit={() => {
        if (row.ownId !== null) setEditing({ kind: 'edit', id: row.ownId });
      }}
      onRemove={() => {
        if (row.ownId !== null) setRemoving({ id: row.ownId, name: row.name });
      }}
    />
  );

  const dialogs = (
    <>
      {editing === null ? null : (
        <PlaybookEditorDialog
          key={editing.kind === 'copy' ? `copy:${editing.source.id}` : `edit:${editing.id}`}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        title={t('llm.playbook.deleteTitle')}
        description={t('llm.playbook.deleteBody', { name: removing?.name ?? '' })}
        confirmLabel={t('common.deleteConfirm')}
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target === null) return;
          usePlaybooksStore.getState().remove(target.id);
          useSettingsStore.getState().setPlaybookShown(`own:${target.id}`, true);
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  );

  return { menu, dialogs };
}
