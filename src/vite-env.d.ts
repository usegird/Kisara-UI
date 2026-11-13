/// <reference types="vite/client" />

/** アプリの版とビルドのコミット（`vite.config.ts` の `define`。診断ファイルに書く） */
declare const __KISARA_BUILD__: { readonly version: string; readonly commit: string | null };
