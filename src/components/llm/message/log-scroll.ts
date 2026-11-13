// ─────────────────────────────
// 会話のログ（会話の画面とプロンプトの相談の欄）を末尾まで送ってあるかの判定。末尾を見ている間だけ、
// 届いた文に合わせて送り続ける。
// ─────────────────────────────

/** 末尾を見ているとみなす隙間（px） */
const BOTTOM_SLACK = 24;

/** 下端までの送り残し（px） */
export function bottomGapOf(element: Element): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

/** 末尾を見ているか（下端までの送り残しが隙間の内） */
export function isNearBottom(element: Element): boolean {
  return bottomGapOf(element) <= BOTTOM_SLACK;
}
