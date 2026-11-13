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

// ─────────────────────────────
// プレイブックの一覧の行と、行の右端のメニューとそのダイアログ。選ぶ所と機能のタブのカードで同じものを使う。
// 要素を返すフック（ダイアログを開いているかは使う側の部品の中だけ）。
// ─────────────────────────────

/** プレイブックの一覧の 1 行 */
export interface PlaybookRow {
  /**
   * `builtin:<id>`・`own:<id>`（選ぶ所から外す設定の鍵にも使う）
   */
  readonly key: string;
  readonly playbook: () => Playbook;
  readonly name: string;
  readonly description: string;
  /** 自分のものの id（標準は null） */
  readonly ownId: string | null;
  /** 標準・自分のものの中での id（選んでいるかを見るため） */
  readonly id: string;
  readonly origin: Playbook['origin'];
}

/** 標準と自分のもの（作った順）の行 */
export function playbookRows(own: Readonly<Record<string, OwnPlaybook>>): {
  readonly builtin: readonly PlaybookRow[];
  readonly mine: readonly PlaybookRow[];
} {
  // 保留のものは出さない
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

/** 行のメニューを描く関数と、メニューから開くダイアログ */
interface PlaybookManage {
  /** その行の右端のメニュー */
  readonly menu: (row: PlaybookRow, className: string) => React.ReactElement;
  /** 作る・直すのダイアログと、消す確かめ */
  readonly dialogs: React.ReactElement;
}

/** 行の右端のメニュー（写して作る・直す・消す）と、そこから開く作る・直すダイアログと消す確かめを返す */
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
          // 消したものの「選ぶ所から外す」も外す
          useSettingsStore.getState().setPlaybookShown(`own:${target.id}`, true);
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  );

  return { menu, dialogs };
}
