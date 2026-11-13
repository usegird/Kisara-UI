// ─────────────────────────────
// ゲートウェイと本体のオリジン。どちらもこのアプリが配る先で、利用者の入力ではない。
// 開発ではゲートウェイを別のポートで出し、オリジンが分かれた状態で確かめる。
// ─────────────────────────────

/** 本番のゲートウェイのオリジン */
const PRODUCTION_GATEWAY = 'https://gw.kisara-ui.com';
/** 本番の本体のオリジン */
const PRODUCTION_APP = 'https://kisara-ui.com';
/** 開発サーバのゲートウェイのオリジン（`pnpm dev:gateway`） */
const DEV_GATEWAY = 'http://localhost:5186';
/** 開発サーバの本体のオリジン（`pnpm dev`） */
const DEV_APP = 'http://localhost:5173';

/** ゲートウェイのオリジン */
export const GATEWAY_ORIGIN: string = import.meta.env.DEV ? DEV_GATEWAY : PRODUCTION_GATEWAY;

/** 本体のオリジン（ゲートウェイが要求を受けてよい送り元） */
export const APP_ORIGIN: string = import.meta.env.DEV ? DEV_APP : PRODUCTION_APP;

/** ゲートウェイの iframe のページ */
export const GATEWAY_FRAME_PATH = '/gateway.html';

/** キーの入力の窓のページ */
export const GATEWAY_ENTRY_PATH = '/gateway-entry.html';
