import { SOURCE_LOCALE } from '@/i18n/locales';

export type LegalDocument = 'terms' | 'privacy';

const DOCUMENTS: readonly LegalDocument[] = ['terms', 'privacy'];

const LOADERS = import.meta.glob<string>('/legal/*/*.txt', { query: '?raw', import: 'default' });

const loaded = new Map<string, string>();

async function load(code: string, document: LegalDocument): Promise<void> {
  const key = `${code}/${document}`;
  if (loaded.has(key)) return;
  const loader = LOADERS[`/legal/${key}.txt`];
  if (!loader) return;
  try {
    loaded.set(key, await loader());
  } catch (error) {
    console.error('[規約の本文の読み込み]', error);
  }
}

export async function initLegal(code: string): Promise<void> {
  const codes = code === SOURCE_LOCALE ? [SOURCE_LOCALE] : [SOURCE_LOCALE, code];
  await Promise.all(codes.flatMap((c) => DOCUMENTS.map((document) => load(c, document))));
}

export function legalText(document: LegalDocument, code: string): string {
  return loaded.get(`${code}/${document}`) ?? loaded.get(`${SOURCE_LOCALE}/${document}`) ?? '';
}
