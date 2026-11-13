import { create } from 'zustand';

// ─────────────────────────────
// 応答の受け取りの記録（このページで受け取った候補ごとの時刻・費用・ツールの状態）。
// **残さない**（読み込み直すと消える）。会話の中身には足さない。
// ─────────────────────────────

/** 送った時点のモデルの費用（1 トークンあたりの米ドル）。分からなければ null */
export interface ResponsePrice {
  readonly prompt: number | null;
  readonly completion: number | null;
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
}

/** 1 つの候補の受け取りの記録 */
export interface ResponseStats {
  /** 時刻はどれも `performance.now()` の ms */
  readonly sentAt: number;
  readonly firstAt: number | null;
  readonly endedAt: number | null;
  readonly price: ResponsePrice;
  /**
   * サーバー側のツールを動かしているとみなすか（受け取り中の表示に使う）。サーバー側のツールを送った
   * ときだけ、本文か思考が届き始めた後に、本文と思考が `TOOLING_GAP_MS` 以上途切れて処理中の注釈の行が
   * 届いたら立て、次の本文か思考が届いたら下ろす
   */
  readonly tooling: boolean;
  /** サーバー側のツール（Web 検索・取得）を送ったか */
  readonly serverTools: boolean;
}

/**
 * 注釈の行をツールとみなすまでの、本文と思考の途切れ（ms）。注釈の行はふつうの思考の塊の合間にも
 * 届くので、短い途切れでは立てない（点滅させない）
 */
export const TOOLING_GAP_MS = 1500;

/** 最後に本文か思考が届いた時刻。塊ごとに書くので、描き直しの元にならないよう状態に入れない */
const lastText = new Map<string, number>();

/** 記録の鍵（「会話の id / メッセージの id / 候補の番号」） */
export function responseKey(chatId: string, messageId: string, candidate: number): string {
  return `${chatId}/${messageId}/${String(candidate)}`;
}

interface ResponseStatsState {
  readonly stats: Readonly<Record<string, ResponseStats>>;
  readonly start: (key: string, price: ResponsePrice, at: number, serverTools?: boolean) => void;
  /** 最初の文字が届いた（2 回目からは何もしない） */
  readonly first: (key: string, at: number) => void;
  readonly end: (key: string, at: number) => void;
  /** 処理中の注釈の行が届いた（本文か思考が届き始める前・途切れが短い間は何もしない） */
  readonly processing: (key: string, at: number) => void;
  /** 本文か思考が届いた（ツールを動かしている印を下ろす） */
  readonly resume: (key: string, at: number) => void;
}

export const useResponseStatsStore = create<ResponseStatsState>()((set, get) => {
  const patch = (key: string, next: (stats: ResponseStats) => ResponseStats | null): void => {
    const current = get().stats[key];
    if (current === undefined) return;
    const changed = next(current);
    if (changed !== null) set({ stats: { ...get().stats, [key]: changed } });
  };
  return {
    stats: {},
    start: (key, price, at, serverTools = false) => {
      lastText.delete(key);
      set({
        stats: {
          ...get().stats,
          [key]: { sentAt: at, firstAt: null, endedAt: null, price, tooling: false, serverTools },
        },
      });
    },
    first: (key, at) =>
      patch(key, (stats) => (stats.firstAt === null ? { ...stats, firstAt: at } : null)),
    end: (key, at) => {
      lastText.delete(key);
      patch(key, (stats) => ({ ...stats, endedAt: at, tooling: false }));
    },
    // 変わらないときは書かない（注釈の行は 0.4 秒ごと、本文は塊ごとに届く）
    processing: (key, at) =>
      patch(key, (stats) => {
        const since = lastText.get(key);
        if (!stats.serverTools || stats.tooling || since === undefined) return null;
        return at - since < TOOLING_GAP_MS ? null : { ...stats, tooling: true };
      }),
    resume: (key, at) => {
      lastText.set(key, at);
      patch(key, (stats) => (stats.tooling ? { ...stats, tooling: false } : null));
    },
  };
});
