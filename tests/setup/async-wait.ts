// 画面が出るのを待つ上限（`findBy*` / `waitFor`）。開いたときに読む部品（React.lazy）は、
// 初めて読むときにモジュールの変換を待つ。React Compiler を掛けた変換は遅く、
// テストを並べて走らせると既定の 1 秒を超えて、回すたびに違うテストが落ちる。
// テストごとに延ばさず、ここで一律に延ばす（テスト全体の上限は vite.config.ts の testTimeout）。
// 画面を描かないテスト（node の環境）では読まない（ファイルごとの前準備が重くなる。読んでも使わない）
if (typeof document !== 'undefined') {
  const { configure } = await import('@testing-library/dom');
  configure({ asyncUtilTimeout: 10_000 });
}
