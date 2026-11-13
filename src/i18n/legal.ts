import { SOURCE_LOCALE } from '@/i18n/locales';

// ─────────────────────────────
// 利用規約とプライバシーポリシーの本文を `legal/<符号>/<文書>.txt` から読む。許諾が表と違う
// （`legal/README.md`）ので表に置かない。読む時機は表と同じで、`initLocale()` が呼ぶ。
// ─────────────────────────────

/** 本文を持つ文書 */
export type LegalDocument = 'terms' | 'privacy';

const DOCUMENTS: readonly LegalDocument[] = ['terms', 'privacy'];

/** 文書の本文。使う言語と正の言語（英語）の分だけ読む */
const LOADERS = import.meta.glob<string>('/legal/*/*.txt', { query: '?raw', import: 'default' });

/** 読み終えた本文。鍵は `<符号>/<文書>` */
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

/** 使う言語と正の言語の本文を読む。表と同じく描く前に 1 回 */
export async function initLegal(code: string): Promise<void> {
  const codes = code === SOURCE_LOCALE ? [SOURCE_LOCALE] : [SOURCE_LOCALE, code];
  await Promise.all(codes.flatMap((c) => DOCUMENTS.map((document) => load(c, document))));
}

/** 文書の本文。今の言語に無ければ英語、まだ読んでいなければ空 */
export function legalText(document: LegalDocument, code: string): string {
  return loaded.get(`${code}/${document}`) ?? loaded.get(`${SOURCE_LOCALE}/${document}`) ?? '';
}
