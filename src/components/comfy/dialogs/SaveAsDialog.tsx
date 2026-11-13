import { useState } from 'react';

import { DialogClose, DialogFrame } from '@/components/ui/dialog';
import { dialogButton } from '@/components/ui/dialog-button';
import { t } from '@/i18n';

// ─────────────────────────────
// 名前を付けて保存のダイアログ。名前を尋ねるだけで、書き込みは呼び出し側。
// 焦点の閉じ込めと Escape は自作せず Base UI に任せる。
// ─────────────────────────────

/** 名前を付けて保存のダイアログの props */
export interface SaveAsDialogProps {
  /** 出しているか。開閉は呼び出し側が持つ */
  readonly open: boolean;
  /** 開いたときに入れておく名前（今のタブの名前） */
  readonly initialName: string;
  /** 前後の空白を除いた名前で保存する */
  readonly onSave: (name: string) => void;
  /** やめる・閉じる */
  readonly onCancel: () => void;
}

/** 保存する名前を尋ねる。空の名前では保存を押せない */
export function SaveAsDialog({
  open,
  initialName,
  onSave,
  onCancel,
}: SaveAsDialogProps): React.ReactElement {
  return (
    <DialogFrame
      id="save-as"
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      size="sm"
      title={t('comfy.saveAs.title')}
      description={t('comfy.saveAs.description')}
    >
      {/* 開くたびに初期値から始めたいので、中身は開いている間だけ置く */}
      {open ? <NameForm initialName={initialName} onSave={onSave} /> : null}
    </DialogFrame>
  );
}

interface NameFormProps {
  readonly initialName: string;
  readonly onSave: (name: string) => void;
}

function NameForm({ initialName, onSave }: NameFormProps): React.ReactElement {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  return (
    <form
      className="flex flex-col gap-3 p-4 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed.length > 0) onSave(trimmed);
      }}
    >
      <input
        autoFocus
        className="border-input rounded-md border bg-transparent px-2 py-1 text-sm"
        value={name}
        aria-label={t('comfy.saveAs.nameLabel')}
        onChange={(event) => setName(event.target.value)}
        onFocus={(event) => event.target.select()}
      />
      <div className="flex justify-end gap-2">
        <DialogClose className={dialogButton({ tone: 'secondary' })}>
          {t('common.cancel')}
        </DialogClose>
        <button
          type="submit"
          className={dialogButton({ tone: 'primary' })}
          disabled={trimmed.length === 0}
        >
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}
