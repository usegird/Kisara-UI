import type { StoreApi } from 'zustand';

import { prefillText } from '@/chat/assemble';
import { loreSourcesOf } from '@/chat/chat-sources';
import { endpointOf } from '@/chat/connection-profile';
import { type PromptSources } from '@/chat/macros';
import { NO_SEMANTIC_HITS } from '@/chat/semantic';
import {
  applyStreamEvents,
  finishStream,
  receivedNothing,
  recordSend,
  recordTiming,
  startWithPrefill,
  timingOf,
} from '@/chat/stream-receive';
import { planSend, ratioOf } from '@/chat/tokens';
import { lastToolCalls } from '@/chat/tool-calls';
import type { Chat, ConnectionProfile, ToolCallRecord, ToolCallState } from '@/chat/types';
import type { ChatStreamEvent, LlmFailure, LlmResult } from '@/port/llm-port';
import { currentLlmTarget, learnOverflow, type LlmTarget } from '@/store/chat/llm-target';
import { llmPort } from '@/store/ports/llm-port';
import { tagSentRequest } from '@/store/ports/llm-sent-log';
import {
  canSend,
  chatToolsOf,
  currentLoreLibrary,
  isBlocked,
  passFreshToolCalls,
  requestOf,
  responsePriceOf,
  sendMaterials,
  sourcesOf,
  type SendMaterials,
} from '@/store/slices/chat-kit';
import type { ChatState } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { responseKey, useResponseStatsStore } from '@/store/use-response-stats-store';
import { semanticHitsOf, useSemanticStore } from '@/store/use-semantic-store';

// ─────────────────────────────
// 会話のストアの slice が共有する、会話を変える・受け取り中の候補へ送る・届いた分を間引いて足す手続き。
// 受け取り中の要求と、まだ足していない分は会話ごとに 1 つ（ストアは 1 つなのでここに持つ）。
// ─────────────────────────────

/** 画面が描かれる合図が来ないとき（裏に回ったブラウザのタブなど）に、待つ上限（ms） */
const FLUSH_FALLBACK_MS = 100;

/** 受け取り中の要求。会話ごとに 1 つ */
const controllers = new Map<string, AbortController>();

/**
 * 受け取り中の候補の記録の鍵。会話ごとに 1 つ
 */
const statsKeys = new Map<string, string>();

/**
 * 届いて、まだ会話へ足していない分。描き直しを間引くため、届いた分は溜めて画面が描かれる間隔で
 * 1 回だけ会話へ足す
 */
const pending = new Map<string, ChatStreamEvent[]>();
/** 予約した書き込みを取り消す手続き。予約していなければ null */
let cancelFlush: (() => void) | null = null;

/** 外す件数と、そのときの見積もり */
type SendPlan = ReturnType<typeof planSend>;

/** slice が使う、会話を変える・送る手続き */
interface ChatStream {
  /** 会話を変える。最後に変えた時刻を進める。会話が無いか `next` が null なら false */
  readonly change: (chatId: string, next: Chat | null) => boolean;
  /** 会話を変えられたら、受け取り中の候補へ送る */
  readonly start: (chatId: string, next: Chat | null) => void;
  /** 送れるか（会話があり、送れる設定で、容量の不足で止めていない）。送れれば会話 */
  readonly sendable: (chatId: string) => Chat | null;
}

/** 送る手続きの中で使う、ストアの読み書き */
interface StreamKit {
  readonly get: () => ChatState;
  readonly change: ChatStream['change'];
  readonly flush: () => void;
  readonly receive: (chatId: string, event: ChatStreamEvent) => void;
}

/** 送る 1 回の材料 */
interface StreamSend {
  readonly chatId: string;
  readonly chat: Chat;
  readonly target: LlmTarget;
  readonly profile: ConnectionProfile;
  readonly sources: PromptSources;
  readonly materials: SendMaterials;
  readonly key: string | null;
  readonly prefill: string;
  readonly signal: AbortSignal;
}

/** ストアの set と get から、slice が使う会話を変える・送る手続きを作る */
export function createChatStream(
  set: StoreApi<ChatState>['setState'],
  get: () => ChatState,
): ChatStream {
  const change: ChatStream['change'] = (chatId, next) => {
    const { chats } = get();
    if (next === null || chats[chatId] === undefined) return false;
    // 写す前からの会話は、変えて書くときにプリセットの id を写す（開いたときにプリセットを
    // 読み終えていなかった分）
    set({ chats: { ...chats, [chatId]: { ...next, updatedAt: Date.now() } } });
    return true;
  };

  const flush = (): void => {
    cancelFlush?.();
    cancelFlush = null;
    const { chats } = get();
    let next: Record<string, Chat> | null = null;
    for (const [chatId, events] of pending) {
      const chat = chats[chatId];
      if (chat === undefined) continue;
      next ??= { ...chats };
      next[chatId] = applyStreamEvents(chat, events);
    }
    pending.clear();
    if (next !== null) set({ chats: next });
  };

  const receive = (chatId: string, event: ChatStreamEvent): void => {
    if (!noteReceived(chatId, event)) return;
    const list = pending.get(chatId);
    if (list === undefined) pending.set(chatId, [event]);
    else list.push(event);
    cancelFlush ??= scheduleFrame(flush);
  };

  const kit: StreamKit = { get, change, flush, receive };
  return {
    change,
    start: (chatId, next) => {
      if (change(chatId, next)) void stream(kit, chatId);
    },
    sendable: (chatId) => {
      const chat = get().chats[chatId];
      return canSend(chat) && chat !== undefined && !isBlocked(get(), chatId) ? chat : null;
    },
  };
}

/** 受け取り中の要求を止める */
export function abortStream(chatId: string): void {
  controllers.get(chatId)?.abort();
}

/** 開いている会話を手放すときに、受け取り中の要求を止め、まだ足していない分を捨てる */
export function forgetStream(chatId: string): void {
  controllers.get(chatId)?.abort();
  controllers.delete(chatId);
  pending.delete(chatId);
}

/** 受け取り中の候補へ送る。送る中身は送る時点の会話から組み立てる */
async function stream(kit: StreamKit, chatId: string): Promise<void> {
  const chat = kit.get().chats[chatId];
  const target = currentLlmTarget();
  const profile = useLlmProfilesStore
    .getState()
    .profiles.find((item) => item.id === target.profileId);
  if (chat === undefined || profile === undefined) {
    const failure: LlmFailure = { kind: 'not-found' };
    if (chat !== undefined) kit.change(chatId, finishStream(chat, failure));
    return;
  }
  // プレフィルはロアを使わないので、近似判定を待たずに受け取りを始める（送るのを二重にしない）
  const prefill = prefillText(chat.prompt, sourcesOf(chat));
  kit.change(chatId, startWithPrefill(chat, prefill));
  // 近似判定を待つ間に止められるよう、先に止め口を置く（止めたら送らずに「止めた」で終わる）
  const controller = new AbortController();
  controllers.set(chatId, controller);
  // Web 検索・取得の注意は有効にするときに確かめたので、送るときは確かめない
  const materials = sendMaterials(chat, profile.baseUrl);
  // 送るときだけ発動率を振り、近似判定を行う。行わないときは待たない
  const scoring = semanticHitsOf(loreSourcesOf(chat, currentLoreLibrary()), chat.messages);
  const semantic = scoring === null ? NO_SEMANTIC_HITS : await scoring;
  // 送るときに行った結果は、プロンプトのタブの見込みにも使う
  if (scoring !== null) useSemanticStore.getState().setPreview(chatId, semantic);
  const sources = sourcesOf(chat, undefined, { roll: Math.random, semantic });
  const key = startStats(kit, chatId, target, materials.web !== null);
  const send = { chatId, chat, target, profile, sources, materials, key, prefill };
  const result = await sendFitting(kit, { ...send, signal: controller.signal });
  if (controllers.get(chatId) === controller) controllers.delete(chatId);
  if (key !== null) {
    useResponseStatsStore.getState().end(key, performance.now());
    if (statsKeys.get(chatId) === key) statsKeys.delete(chatId);
  }
  kit.flush();
  finishReceived(kit, { chatId, chat, key }, result);
}

/**
 * 受け取る候補の時刻と、送る時点の費用を記録し始める（残さない）。受け取る候補の鍵を返す
 */
function startStats(
  kit: StreamKit,
  chatId: string,
  target: LlmTarget,
  web: boolean,
): string | null {
  const receiving = kit.get().chats[chatId]?.messages.at(-1);
  const key =
    receiving === undefined ? null : responseKey(chatId, receiving.id, receiving.selected);
  if (key === null) return null;
  statsKeys.set(chatId, key);
  // 「ツールを実行中」はサーバー側のツールを送ったときだけ出す
  useResponseStatsStore.getState().start(key, responsePriceOf(target), performance.now(), web);
  return key;
}

/**
 * 送る。上限が分かれば、収まるまで古い履歴を外して送る。断りで上限と補正を知ったら、
 * 何も受け取っておらず、外す件数が増えるなら 1 回だけ送り直す
 */
async function sendFitting(kit: StreamKit, send: StreamSend): Promise<LlmResult<null>> {
  const { chatId, chat, sources, materials } = send;
  let plan = planSend({ chat, composition: chat.prompt, sources }, materials.budget());
  for (let attempt = 0; ; attempt += 1) {
    const result = await sendOnce(kit, send, plan);
    if (result.ok || attempt > 0) return result;
    const overflow = result.failure.overflow;
    if (overflow === undefined) return result;
    learnOverflow(send.target, result.failure);
    kit.flush();
    const current = kit.get().chats[chatId];
    if (current === undefined || !receivedNothing(current, send.prefill)) return result;
    const ratio = overflow.prompt === null ? undefined : ratioOf(overflow.prompt, plan.estimate);
    const next = planSend({ chat, composition: chat.prompt, sources }, materials.budget(), ratio);
    if (next.drop <= plan.drop) return result;
    plan = next;
  }
}

/** 外す件数を決めた要求を 1 回送る */
function sendOnce(kit: StreamKit, send: StreamSend, plan: SendPlan): Promise<LlmResult<null>> {
  const { chatId, key } = send;
  const sending = kit.get().chats[chatId];
  if (sending !== undefined) kit.change(chatId, recordSend(sending, plan.estimate, plan.drop));
  const request = requestOf(send.chat, send.target, send.sources, {
    materials: send.materials,
    drop: plan.drop,
  });
  // 発言の送った中身のアイコンで引けるよう、受け取る候補の鍵を添える
  if (key !== null) tagSentRequest(request, key);
  return llmPort().streamChat(endpointOf(send.profile), request, {
    onEvent: (event) => kit.receive(chatId, event),
    signal: send.signal,
  });
}

/**
 * 受け取り終えた会話を仕上げる。受け取りの記録は候補に残し（読み込み直しても消えない）、
 * 新しく受け取った呼び出しを受け手に渡す
 */
function finishReceived(
  kit: StreamKit,
  sent: { readonly chatId: string; readonly chat: Chat; readonly key: string | null },
  result: LlmResult<null>,
): void {
  const { chatId, key } = sent;
  const times = key === null ? undefined : useResponseStatsStore.getState().stats[key];
  const received = kit.get().chats[chatId];
  if (received !== undefined && times !== undefined) {
    kit.change(
      chatId,
      recordTiming(received, (candidate) => timingOf(times, candidate.usage, times.price)),
    );
  }
  const current = kit.get().chats[chatId];
  if (current === undefined) return;
  const check = (call: ToolCallRecord): ToolCallState => chatToolsOf().check(call, current);
  kit.change(chatId, finishStream(current, result.ok ? null : result.failure, check));
  const finished = kit.get().chats[chatId];
  const last = finished?.messages.at(-1);
  if (finished === undefined || last === undefined) return;
  // 受け取る前からあった呼び出し（本文を書かせた候補の分）は渡し直さない
  const before = new Set(lastToolCalls(sent.chat).map((call) => call.id));
  const waiting = lastToolCalls(finished).filter(
    (call) => call.state.kind === 'waiting' && !before.has(call.id),
  );
  if (waiting.length > 0) passFreshToolCalls(chatId, last.id, waiting);
}

/**
 * 届いた知らせを記録に写す。会話へ足すなら true。最初の本文か思考の本文が届いた時刻を記録し
 * （2 回目からは記録しない）、処理中の注釈の行は会話に足さない（受け取り中の印にだけ効く）
 */
function noteReceived(chatId: string, event: ChatStreamEvent): boolean {
  const key = statsKeys.get(chatId);
  if (key !== undefined && event.kind === 'delta' && (event.content || event.reasoning)) {
    const at = performance.now();
    useResponseStatsStore.getState().first(key, at);
    useResponseStatsStore.getState().resume(key, at);
  }
  if (event.kind !== 'processing') return true;
  if (key !== undefined) useResponseStatsStore.getState().processing(key, performance.now());
  return false;
}

/**
 * 次に画面が描かれるときに 1 回だけ呼ぶ。合図が来なくても `FLUSH_FALLBACK_MS` で呼ぶ
 * （裏のブラウザのタブでも受け取った分を会話へ足し、控えに書けるように）。取り消す手続きを返す
 */
function scheduleFrame(callback: () => void): () => void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    cancel();
    callback();
  };
  const timer = globalThis.setTimeout(run, FLUSH_FALLBACK_MS);
  const frame =
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame(run)
      : null;
  const cancel = (): void => {
    done = true;
    globalThis.clearTimeout(timer);
    if (frame !== null) globalThis.cancelAnimationFrame(frame);
  };
  return cancel;
}
