import type { PlaybookInstruction } from '@/chat/playbook';
import { canWriteReply } from '@/chat/tool-calls';
import type { Candidate, Chat, ChatMessage } from '@/chat/types';

// ─────────────────────────────
// 会話の操作。どれも新しい会話を返し、受け付けられない操作は null を返す。
// 受け取りの反映と終わり方は stream-receive.ts。
// ─────────────────────────────

/** 半角として数える文字の終わり（Latin-1 まで） */
const LATIN1_LAST = 0xff;
/** 半角カナの始まりと終わり */
const HALFWIDTH_KANA_FIRST = 0xff61;
const HALFWIDTH_KANA_LAST = 0xff9f;

const STREAMING: Candidate = { content: '', reasoning: '', end: { kind: 'streaming' } };

/** 選んでいる候補 */
export function selectedCandidate(message: ChatMessage): Candidate | undefined {
  return message.candidates[message.selected];
}

/** 受け取り中か（最後のメッセージの選んでいる候補が受け取り中） */
export function isStreaming(chat: Chat): boolean {
  const last = chat.messages.at(-1);
  return last !== undefined && selectedCandidate(last)?.end.kind === 'streaming';
}

/** 除く項目のほかは、同じ物を持つか */
function sameExcept(a: object, b: object, skip: ReadonlySet<string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!skip.has(key) && !Object.is(Reflect.get(a, key), Reflect.get(b, key))) return false;
  }
  return true;
}

const MESSAGES = new Set(['messages']);
const CANDIDATES = new Set(['candidates']);
const TEXT = new Set(['content', 'reasoning']);

/**
 * 受け取り中の候補の本文と思考だけが違うか。送る中身とその見積もりは受け取り中の候補を
 * 使わないので、真なら前の会話のまま描いてよい（受け取り中の描き直しを止める）。
 * 会話が無い側があれば、両方とも無いときだけ真
 */
export function sameExceptStreamingText(a: Chat | undefined, b: Chat | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (!isStreaming(a) || !isStreaming(b) || !sameExcept(a, b, MESSAGES)) return false;
  const count = a.messages.length;
  if (count !== b.messages.length) return false;
  for (let index = 0; index < count - 1; index += 1) {
    if (a.messages[index] !== b.messages[index]) return false;
  }
  const lastA = a.messages[count - 1];
  const lastB = b.messages[count - 1];
  if (lastA === undefined || lastB === undefined || !sameExcept(lastA, lastB, CANDIDATES)) {
    return false;
  }
  if (lastA.candidates.length !== lastB.candidates.length) return false;
  return lastA.candidates.every((candidate, index) => {
    const other = lastB.candidates[index];
    if (other === undefined) return false;
    return index === lastA.selected ? sameExcept(candidate, other, TEXT) : candidate === other;
  });
}

/** 最後の発言を差し替える。発言が無ければそのまま */
export function replaceLast(chat: Chat, update: (message: ChatMessage) => ChatMessage): Chat {
  const last = chat.messages.at(-1);
  if (last === undefined) return chat;
  return { ...chat, messages: [...chat.messages.slice(0, -1), update(last)] };
}

/** 選んでいる候補を差し替える */
export function withCandidate(message: ChatMessage, candidate: Candidate): ChatMessage {
  const candidates = [...message.candidates];
  candidates[message.selected] = candidate;
  return { ...message, candidates };
}

function streamingAssistant(id: string): ChatMessage {
  return { id, role: 'assistant', candidates: [STREAMING], selected: 0 };
}

/**
 * 会話の名前の長さの上限（見た目の幅。半角 1・全角 2）
 */
const NAME_WIDTH = 20;

/** 1 文字（書記素）の見た目の幅。Latin-1 と半角カナは 1、ほかは 2 */
function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code <= LATIN1_LAST || (code >= HALFWIDTH_KANA_FIRST && code <= HALFWIDTH_KANA_LAST)
    ? 1
    : 2;
}

/**
 * 本文から会話の名前を作る。最初の空でない行を、見た目の幅で半角 20 字までにする
 * （「…」は付けない）。空白は詰める
 */
export function chatNameFrom(text: string): string {
  const line =
    text
      .split('\n')
      .map((item) => item.trim().replace(/\s+/g, ' '))
      .find((item) => item.length > 0) ?? '';
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let width = 0;
  let name = '';
  for (const { segment } of segmenter.segment(line)) {
    width += charWidth(segment);
    if (width > NAME_WIDTH) break;
    name += segment;
  }
  return name.trimEnd();
}

/** 1 回のやり取りで足す発言。`userId`・`assistantId` は足す 2 つのメッセージの id */
export interface NewTurn {
  readonly text: string;
  readonly userId: string;
  readonly assistantId: string;
  readonly images?: readonly string[] | undefined;
  /** プレイブックの操作で送るときの指示 */
  readonly instruction?: PlaybookInstruction | undefined;
}

/**
 * `user` のメッセージを足し、続けて受け取る `assistant` を足す。名前が空で最初の `user` の
 * メッセージなら、本文から名前も付ける。プレイブックの操作で送るなら、その指示を
 * 発言に持たせる
 */
export function appendTurn(
  chat: Chat,
  { text, userId, assistantId, images = [], instruction }: NewTurn,
): Chat {
  const user: ChatMessage = {
    id: userId,
    role: 'user',
    candidates: [
      {
        content: text,
        reasoning: '',
        end: { kind: 'done', reason: null },
        ...(images.length > 0 ? { images: [...images] } : {}),
      },
    ],
    selected: 0,
    ...(instruction === undefined ? {} : { instruction }),
  };
  const first = !chat.messages.some((message) => message.role === 'user');
  const name = chat.name.trim().length === 0 && first ? chatNameFrom(text) : chat.name;
  return { ...chat, name, messages: [...chat.messages, user, streamingAssistant(assistantId)] };
}

/**
 * 最後の `assistant` に空の候補を足して選ぶ。最後が `assistant` でなければ null。指示があれば、
 * 今選んでいる候補を土台にその指示で作り直す候補にする
 */
export function regenerate(chat: Chat, instruction = ''): Chat | null {
  const last = chat.messages.at(-1);
  if (last?.role !== 'assistant' || isStreaming(chat)) return null;
  const candidate: Candidate =
    instruction.trim().length === 0
      ? STREAMING
      : { ...STREAMING, revision: { base: last.selected, instruction } };
  return replaceLast(chat, (message) => ({
    ...message,
    candidates: [...message.candidates, candidate],
    selected: message.candidates.length,
  }));
}

/**
 * 失敗した応答をもう一度受け取る（「もう一度」）。選んでいる候補が失敗していれば、
 * 候補を足さずにその候補を受け取り中に戻して書き直す（失敗の印は消える）。失敗していなければ
 * 生成し直すと同じ
 */
export function retry(chat: Chat): Chat | null {
  const last = chat.messages.at(-1);
  if (last?.role !== 'assistant' || isStreaming(chat)) return null;
  if (last.candidates[last.selected]?.end.kind !== 'failed') return regenerate(chat);
  return replaceLast(chat, (message) => {
    const candidates = [...message.candidates];
    // 指示で作り直した候補は、土台と指示を持ったまま受け取り直す
    const revision = candidates[message.selected]?.revision;
    candidates[message.selected] = revision === undefined ? STREAMING : { ...STREAMING, revision };
    return { ...message, candidates };
  });
}

/**
 * 呼び出しだけを返した最後の `assistant` の候補を、本文を受け取る受け取り中に戻す。
 * 呼び出しの列と状態はそのまま持ち、思考は前の思考の後ろに空行を挟んで続ける。書かせられなければ null
 */
export function writeReply(chat: Chat): Chat | null {
  const last = chat.messages.at(-1);
  const candidate = last === undefined ? undefined : selectedCandidate(last);
  if (last?.role !== 'assistant' || candidate === undefined || !canWriteReply(candidate)) {
    return null;
  }
  const { finishReason, ...rest } = candidate;
  void finishReason;
  const reasoning = rest.reasoning.trim().length === 0 ? '' : `${rest.reasoning.trimEnd()}\n\n`;
  return replaceLast(chat, (message) =>
    withCandidate(message, { ...rest, content: '', reasoning, end: { kind: 'streaming' } }),
  );
}

/**
 * 直前の応答がその初期メッセージだったことにする（プロンプトのタブの初期メッセージ）。
 * 初期メッセージを全部候補に持つ `assistant` の発言を最後に足し
 * （直前の応答は消さない）、`selected` 番目（見ている頁）を選ぶ。空の初期メッセージは候補にしない。
 * 受け取り中・全部空なら null
 */
export function respondWith(
  chat: Chat,
  contents: readonly string[],
  selected: number,
  id: string,
): Chat | null {
  if (isStreaming(chat)) return null;
  const filled = contents.flatMap((content, index) =>
    content.trim().length === 0 ? [] : [{ content, index }],
  );
  if (filled.length === 0) return null;
  const candidates: Candidate[] = filled.map(({ content }) => ({
    content,
    reasoning: '',
    end: { kind: 'done', reason: null },
  }));
  // 見ている頁が空なら先頭を選ぶ
  const at = Math.max(
    0,
    filled.findIndex(({ index }) => index === selected),
  );
  const message: ChatMessage = { id, role: 'assistant', candidates, selected: at };
  return { ...chat, messages: [...chat.messages, message] };
}

/**
 * そのメッセージの手前まで会話を戻す（ロールバック）。そのメッセージと後ろは消し、そのメッセージの
 * 選んでいる本文を返す（入力欄へ写して、直してから送り直す）。生成はしない。`user` のメッセージだけ
 */
export function rollback(
  chat: Chat,
  messageId: string,
): { readonly chat: Chat; readonly content: string; readonly images: readonly string[] } | null {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  const message = chat.messages[index];
  if (message?.role !== 'user' || isStreaming(chat)) return null;
  const candidate = selectedCandidate(message);
  return {
    chat: { ...chat, messages: chat.messages.slice(0, index) },
    content: candidate?.content ?? '',
    images: candidate?.images ?? [],
  };
}

/**
 * その `assistant` のメッセージまでを残し、後ろを落とした会話（フォークの写しの中身）。
 * ほかの役割・受け取り中は null
 */
export function forkedChat(chat: Chat, messageId: string): Chat | null {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  if (chat.messages[index]?.role !== 'assistant' || isStreaming(chat)) return null;
  return { ...chat, messages: chat.messages.slice(0, index + 1) };
}

/** そのメッセージより後ろにメッセージがあるか（ロールバックの前に確かめる） */
export function hasMessagesAfter(chat: Chat, messageId: string): boolean {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  return index >= 0 && index < chat.messages.length - 1;
}

function updateMessage(
  chat: Chat,
  messageId: string,
  update: (message: ChatMessage) => ChatMessage | null,
): Chat | null {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  const message = chat.messages[index];
  if (message === undefined) return null;
  const next = update(message);
  if (next === null) return null;
  const messages = [...chat.messages];
  messages[index] = next;
  return { ...chat, messages };
}

/** 選んでいる候補だけを変える。範囲の外・受け取り中は null */
export function selectCandidate(chat: Chat, messageId: string, index: number): Chat | null {
  if (isStreaming(chat)) return null;
  return updateMessage(chat, messageId, (message) =>
    index < 0 || index >= message.candidates.length || index === message.selected
      ? null
      : { ...message, selected: index },
  );
}

/** 選んでいる候補の本文を書き換える。以降のメッセージは消さない */
export function editMessage(chat: Chat, messageId: string, content: string): Chat | null {
  if (isStreaming(chat)) return null;
  return updateMessage(chat, messageId, (message) => {
    const candidate = selectedCandidate(message);
    if (candidate === undefined || candidate.content === content) return null;
    return withCandidate(message, { ...candidate, content });
  });
}

/** そのメッセージだけを消す */
export function removeMessage(chat: Chat, messageId: string): Chat | null {
  if (isStreaming(chat) || !chat.messages.some((message) => message.id === messageId)) return null;
  return { ...chat, messages: chat.messages.filter((message) => message.id !== messageId) };
}
