import type { DictionaryFileProblem } from '@/chat/dictionary-file';
import { toastError, toastSuccess } from '@/components/ui/toast-manager';
import { t, type MessageKey } from '@/i18n';
import type { DictionaryImport } from '@/store/use-dictionaries-store';

const ACCEPT = '.json,.csv,.tsv,application/json,text/csv,text/tab-separated-values';

const PROBLEM_TEXT: Readonly<Record<DictionaryFileProblem, MessageKey>> = {
  format: 'llm.extension.dictionary.problem.format',
  empty: 'llm.extension.dictionary.problem.empty',
  size: 'llm.extension.dictionary.problem.size',
};

export function reportDictionaryImport(result: DictionaryImport): void {
  if (result.kind === 'error') {
    toastError(
      t('llm.extension.dictionary.failed', {
        name: result.fileName,
        reason: t(PROBLEM_TEXT[result.problem]),
      }),
    );
    return;
  }
  toastSuccess(
    result.kind === 'added'
      ? t('llm.extension.dictionary.imported', { name: result.name, count: result.count })
      : t('llm.extension.dictionary.existing', { name: result.name }),
  );
}

export function pickDictionaryFiles(
  multiple: boolean,
  onFile: (file: File) => Promise<void>,
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT;
  input.multiple = multiple;
  input.addEventListener('change', () => {
    void (async () => {
      for (const file of [...(input.files ?? [])]) await onFile(file);
    })();
  });
  input.click();
}
