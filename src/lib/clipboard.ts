// ─────────────────────────────
// 文字列の写し取り。**失敗しうる**（許可されていない・安全な文脈でない環境がある）ので、
// 成否を返して呼び出し側に見せる。握り潰して「写した」と見せない。
// ─────────────────────────────

/** 文字列をクリップボードへ写す。写せたら true */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard === undefined) return false;

  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
