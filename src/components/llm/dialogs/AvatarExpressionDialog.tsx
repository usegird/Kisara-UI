import { CaseSensitive } from 'lucide-react';
import { useRef, useState } from 'react';

import { importExpressions } from '@/chat/avatar-expression-import';
import { expressionChoiceOf } from '@/chat/expression-tool';
import {
  ExpressionBandActions,
  ExpressionCards,
} from '@/components/llm/dialogs/AvatarExpressionParts';
import {
  mergeImported,
  removeItem,
  renameItem,
  replaceItemImage,
  setDefault,
  type LabelProblem,
} from '@/components/llm/dialogs/expression-draft';
import { useExpressionDraft } from '@/components/llm/dialogs/use-expression-draft';
import { useFileDrop } from '@/components/llm/dialogs/use-file-drop';
import { dropOverlay } from '@/components/shared/file-drop';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DialogFrame } from '@/components/ui/dialog';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { PickerBand } from '@/components/ui/picker-band';
import { t, type MessageKey } from '@/i18n';
import { DIALOG_MIN } from '@/lib/dialog-rect';
import { pathedFilesOf, type PathedFile } from '@/lib/dropped-files';
import { IMAGE_FILE_MAX_BYTES, isTooLarge } from '@/lib/file-size';
import { shrinkImage } from '@/lib/image-attach';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

const PROBLEM_TEXT: Readonly<Record<LabelProblem, MessageKey>> = {
  empty: 'llm.expression.problem.empty',
  tooLong: 'llm.expression.problem.tooLong',
  duplicate: 'llm.expression.problem.duplicate',
};

const MAX_SKIPPED_NAMES = 5;

interface Notice {
  readonly text: string;
  readonly failed: boolean;
}

export interface AvatarExpressionDialogProps {
  readonly avatarId: string;
  readonly chatId?: string | undefined;
  readonly onClose: () => void;
}

export function AvatarExpressionDialog({
  avatarId,
  chatId,
  onClose,
}: AvatarExpressionDialogProps): React.ReactElement {
  const [notice, setNotice] = useState<Notice | null>(null);
  const { avatarName, draft, unreadable, select, apply } = useExpressionDraft(avatarId, () =>
    setNotice({ text: t('llm.expression.saveFailed'), failed: true }),
  );
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reveal, setReveal] = useState<string | null>(null);
  const height = useSettingsStore((state) => state.modelCardHeight);
  const ascending = useSettingsStore((state) => state.imageSortAscending);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const selected = draft?.items.find((item) => item.id === draft.selectedId) ?? null;
  const ready = draft !== null && !busy;

  const importFiles = async (files: readonly PathedFile[]): Promise<void> => {
    if (draft === null || files.length === 0) return;
    setBusy(true);
    try {
      const read = await importExpressions(files, IMAGE_FILE_MAX_BYTES);
      const entries = await Promise.all(
        read.entries.map(async (item) => ({ ...item, image: await shrinkImage(item.image) })),
      );
      const counts = mergeImported(draft, entries);
      apply((prev) => mergeImported(prev, entries).draft);
      setReveal(counts.draft.selectedId);
      setNotice(importNoticeOf(counts.added + counts.replaced, read.skipped));
    } finally {
      setBusy(false);
    }
  };

  const replaceImage = async (file: File | undefined): Promise<void> => {
    const target = replaceId;
    if (target === null || file === undefined) return;
    const image = await replacementOf(file);
    if (image === null) {
      setNotice({ text: t('llm.expression.skipped', { names: file.name }), failed: true });
      return;
    }
    apply((prev) => replaceItemImage(prev, target, image));
  };

  const rename = (id: string, label: string): boolean => {
    if (draft === null) return false;
    const checked = renameItem(draft, id, label);
    if (typeof checked === 'string') {
      setNotice({ text: t(PROBLEM_TEXT[checked]), failed: true });
      return false;
    }
    setNotice(null);
    apply((prev) => {
      const next = renameItem(prev, id, label);
      return typeof next === 'string' ? prev : next;
    });
    return true;
  };

  const decide = (label: string): void => {
    if (chooseExpression(chatId, label)) onClose();
  };

  const band = bandStateOf(chatId, selected, draft?.defaultId ?? null);
  const { dropping, dropHandlers } = useFileDrop(ready, (files) => void importFiles(files));
  const removingLabel = draft?.items.find((item) => item.id === removing)?.label ?? '';

  return (
    <DialogFrame
      id="avatar-expression"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="xl"
      movable
      embeddable={false}
      minSize={DIALOG_MIN}
      title={avatarName}
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onKeyDownCapture={(event) => {
          if (event.key !== 'Escape' || selected === null) return;
          if (event.target instanceof Element && event.target.closest('[data-card-rename]')) return;
          select(null);
          event.preventDefault();
          event.stopPropagation();
        }}
        {...dropHandlers}
      >
        <PickerBand
          decideToolbar={t('llm.expression.band.toolbar')}
          decideLabel={t('llm.expression.band.decide')}
          decideTitle={band.decideTitle}
          decideDisabled={!ready || band.decideDisabled}
          decideIcon="set"
          onDecide={() => {
            if (selected !== null) decide(selected.label);
          }}
          actions={
            <ExpressionBandActions
              ready={ready}
              canRemove={band.canRemove}
              onAdd={() => addInput.current?.click()}
              onRemove={() => setRemoving(selected?.id ?? null)}
            />
          }
          filterToolbar={t('llm.expression.band.filterToolbar')}
          filterLabel={t('llm.expression.band.filterLabel')}
          query={query}
          onQuery={setQuery}
          sortOptions={[{ key: 'name', label: t('modelPicker.sort.name'), Icon: CaseSensitive }]}
          sortKey="name"
          ascending={ascending}
          onSort={(_key, next) => useSettingsStore.getState().setImageSortAscending(next)}
          height={height}
          notice={notice}
        />
        {draft === null ? (
          <p className={EMPTY_NOTICE_CLASS}>
            {t(unreadable ? 'llm.expression.unreadable' : 'common.loading')}
          </p>
        ) : (
          <ExpressionCards
            draft={draft}
            query={query}
            ascending={ascending}
            height={height}
            reveal={reveal}
            onSelect={select}
            onPlace={(id) => {
              const label = draft.items.find((item) => item.id === id)?.label ?? '';
              if (chooseExpression(chatId, label)) onClose();
              else select(id);
            }}
            onRename={rename}
            onSetDefault={(id) => apply((prev) => setDefault(prev, id))}
            onReplace={(id) => {
              setReplaceId(id);
              replaceInput.current?.click();
            }}
          />
        )}
        <input
          ref={addInput}
          type="file"
          accept="image/png,image/webp,image/jpeg,application/json,.json"
          multiple
          hidden
          onChange={(event) => {
            const files = pathedFilesOf([...(event.target.files ?? [])]);
            event.target.value = '';
            void importFiles(files);
          }}
        />
        <input
          ref={replaceInput}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void replaceImage(file);
          }}
        />
        {dropping ? <div className={dropOverlay()}>{t('llm.expression.drop')}</div> : null}
      </div>
      <ConfirmDialog
        open={removing !== null}
        title={t('llm.expression.removeTitle')}
        description={t('llm.expression.removeMessage', { name: removingLabel })}
        confirmLabel={t('common.deleteConfirm')}
        onConfirm={() => {
          const id = removing;
          setRemoving(null);
          if (id !== null) apply((prev) => removeItem(prev, id));
        }}
        onCancel={() => setRemoving(null)}
      />
    </DialogFrame>
  );
}

function chooseExpression(chatId: string | undefined, label: string): boolean {
  const chat = chatId === undefined ? undefined : useChatStore.getState().chats[chatId];
  if (chatId === undefined || chat === undefined || label.length === 0) return false;
  useChatStore.getState().update(chatId, { expression: expressionChoiceOf(chat.messages, label) });
  return true;
}

function bandStateOf(
  chatId: string | undefined,
  selected: { readonly id: string; readonly label: string } | null,
  defaultId: string | null,
): { readonly decideTitle: string; readonly decideDisabled: boolean; readonly canRemove: boolean } {
  const canRemove = selected !== null && selected.id !== defaultId;
  if (chatId === undefined) {
    return {
      decideTitle: t('llm.expression.band.decideUnavailable'),
      decideDisabled: true,
      canRemove,
    };
  }
  if (selected === null) {
    return { decideTitle: t('modelPicker.nothingSelected'), decideDisabled: true, canRemove };
  }
  return {
    decideTitle: t('llm.expression.band.decideTitle', { name: selected.label }),
    decideDisabled: false,
    canRemove,
  };
}

async function replacementOf(file: File): Promise<Blob | null> {
  if (isTooLarge(file, IMAGE_FILE_MAX_BYTES)) return null;
  const read = await importExpressions([{ file, path: file.name }], IMAGE_FILE_MAX_BYTES);
  const image = read.entries[0]?.image;
  return image === undefined ? null : shrinkImage(image);
}

function importNoticeOf(imported: number, skipped: readonly string[]): Notice | null {
  const parts: string[] = [];
  if (imported === 0) parts.push(t('llm.expression.nothingImported'));
  if (skipped.length > 0) {
    const names = skipped.slice(0, MAX_SKIPPED_NAMES).join(', ');
    const more = skipped.length > MAX_SKIPPED_NAMES ? ' …' : '';
    parts.push(t('llm.expression.skipped', { names: `${names}${more}` }));
  }
  return parts.length === 0 ? null : { text: parts.join(' '), failed: true };
}
