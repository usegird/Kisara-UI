import type { DictionaryFileProblem } from '@/chat/dictionary-file';
import { toastError, toastSuccess } from '@/components/ui/toast-manager';
import { t, type MessageKey } from '@/i18n';
import type { DictionaryImport } from '@/store/use-dictionaries-store';

// ─────────────────────────────
// 追加辞書のファイルを選ばせる・結果を知らせる。機能のタブと、プロンプトのタブの個別追加辞書で使う。
// 部品と別のファイルに置く（部品以外を一緒に export すると Fast Refresh が状態を保てない）。
// ─────────────────────────────

const ACCEPT = '.json,.csv,.tsv,application/json,text/csv,text/tab-separated-values';

const PROBLEM_TEXT: Readonly<Record<DictionaryFileProblem, MessageKey>> = {
  format: 'llm.extension.dictionary.problem.format',
  empty: 'llm.extension.dictionary.problem.empty',
  size: 'llm.extension.dictionary.problem.size',
};

/** 取り込んだ 1 ファイルの結果を知らせる */
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

/** 追加辞書のファイル（`.json`・`.csv`・`.tsv`）を選ばせ、選んだものを 1 つずつ渡す */
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
