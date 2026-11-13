import type { ComfyPort } from '@/port/comfy-port';
import { guardComfyPort } from '@/store/ports/network-consent';
import { traceComfyPort } from '@/store/ports/trace-ports';

// ─────────────────────────────
// 通信の窓口の受け口。入口が実装を 1 つ入れ、store と hooks はここから受け取る。
// 実装は呼ぶたびに引く（入口より先に読み込まれた store でも、入れた後の実装を使う）。
// ─────────────────────────────

let current: ComfyPort | null = null;

/**
 * 入口から呼ぶ。後から入れたものが勝つ。利用規約に同意するまで通信させない関門で包み、
 * その外側で要求の結果を診断のログに残す（関門が断った分も残る）
 */
export function installComfyPort(port: ComfyPort): void {
  current = traceComfyPort(guardComfyPort(port));
}

/**
 * 関門を通さずに入れる。通信の入口が空の代わりに差し替わる公開用のデモだけが使う。
 * 読める場所は lint で縛る
 */
export function installComfyPortWithoutConsent(port: ComfyPort): void {
  current = port;
}

/** 入っている窓口。入口より先に呼ばれたら、入れ忘れとして投げる */
export function comfyPort(): ComfyPort {
  if (current === null) throw new Error('ComfyPort is not installed (call installComfyPort first)');
  return current;
}
