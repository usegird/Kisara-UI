import { t } from '@/i18n';

export interface SecurityNotesProps {
  readonly notes: readonly string[];
}

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
