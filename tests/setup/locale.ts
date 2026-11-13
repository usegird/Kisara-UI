import { initLocale } from '@/i18n';

// テストは日本語の文言で照らす。テストのファイルが部品を読む前に表を読み終える
await initLocale('ja');
