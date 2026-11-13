# Legal texts (not licensed)

This directory holds the Terms of Service and the Privacy Policy that the official
KisaraUI deployment shows to its users, in each supported language
(`<locale>/terms.txt`, `<locale>/privacy.txt`). The Japanese text is the authoritative
version; the other languages are translations.

These texts are **(c) 2026 Usegrid institute, all rights reserved**. They are excluded from the
Licensed Work of the Business Source License (see `LICENSE`, "Licensed Work") and are
**not** licensed for copying, modification or redistribution. They describe the
obligations of Usegrid institute for the official deployment only, and they do not apply to any
other deployment, fork or copy (Terms, Article 2).

If you build, deploy or redistribute KisaraUI, replace every file in this directory with
your own terms and privacy policy, naming yourself as the operator. The app reads the
texts from here at build time (`src/i18n/legal.ts`); keep the file names and keep each
file as plain text with blank lines between paragraphs.

---

このフォルダには、公式の KisaraUI の配信が利用者に示す利用規約とプライバシーポリシーの本文を、
対応する言語ごとに置いています（`<言語>/terms.txt`・`<言語>/privacy.txt`）。日本語版が正で、
ほかの言語は訳です。

これらの文面は **(c) 2026 Usegrid institute。全権利を留保**します。Business Source License の
Licensed Work から除いており（`LICENSE` の「Licensed Work」）、複製・改変・再配布を許諾していません。
文面は公式の配信についての Usegrid institute の義務を定めるもので、ほかの配信・フォーク・写しには当たりません
（利用規約 第2条）。

KisaraUI をビルド・配信・再配布するときは、このフォルダのすべてのファイルを、自分を事業者とする
自分の規約とポリシーに置き換えてください。アプリはビルド時にここから本文を読みます（`src/i18n/legal.ts`）。
ファイル名は変えず、空行で段落を分けた素の文字で書いてください。
