import { t } from '@/i18n';

// ─────────────────────────────
// 接続のダイアログの末尾に置くセキュリティの注意。中身は種別の層が組んで渡す
// （`landing.ts`。経路の図と同じ置き場）。ComfyUI と会話の両方が使うので、ここに置く。
// ─────────────────────────────

/** セキュリティの注意の props */
export interface SecurityNotesProps {
  /** 注意の文の並び（訳したもの） */
  readonly notes: readonly string[];
}

/** セキュリティの注意。長いので閉じて置き、見出しを押して開く */
export function SecurityNotes({ notes }: SecurityNotesProps): React.ReactElement {
  return (
    <details className="mt-5 rounded-md border px-3 py-1.5 text-xs">
      <summary className="cursor-pointer font-medium select-none">
        {t('app.landing.notesHeading')}
      </summary>
      <ul className="text-muted-foreground mt-1 mb-1 list-disc space-y-0.5 pl-5">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </details>
  );
}
