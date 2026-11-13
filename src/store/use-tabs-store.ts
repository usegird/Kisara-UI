import { create } from 'zustand';

import type { ChatPlace } from '@/chat/types';
import type { NodeDefinitionMap, NodeId, Workflow } from '@/graph/types';
import { stablePartition } from '@/lib/stable-partition';
import { readTabList } from '@/lib/tab-id';
import { createTabsChatSlice } from '@/store/slices/tabs-chat';
import { newSession, nextId, PAST_SESSIONS_KEY } from '@/store/slices/tabs-kit';
import { createTabsSessionSlice } from '@/store/slices/tabs-sessions';
import { createTabsSwitchSlice } from '@/store/slices/tabs-switch';
import type { AppValues } from '@/store/use-app-values-store';
import type { GraphHistory } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

export {
  EMPTY_SNAPSHOT,
  holdsSession,
  lineageOf,
  nextActiveId,
  PAST_SESSIONS_KEY,
  SESSION_LOCK_PREFIX,
  whenSessionsClaimed,
} from '@/store/slices/tabs-kit';

// ─────────────────────────────
// タブ（1 段のタブバーに種別の違うタブが並ぶ）。ストアに載るワークフローは 1 つだけにし、切り替えるときに
// 今の内容を控えへ移して行き先の控えを載せ直す（既存のストアの形も、購読する側も変えずに済む）。操作は slice に分ける。
// アクティブなタブの名前と編集の有無はグラフストアが正（控えは切り替えた時点のもの）。
// ─────────────────────────────

/**
 * タブの種別。ComfyUI のワークフローと、ワークフローを持たない
 * 画像（中身は画像のタブのストア。名前だけはワークフローと同じく控えに持つ）と、
 * LLM との会話（中身は会話のストアに会話の id ごと。グラフの控えは空のまま）
 */
export type TabKind = 'workflow' | 'image' | 'chat';

/** タブの中身の控え（非アクティブなタブの分） */
export interface TabSnapshot {
  readonly workflow: Workflow | null;
  readonly name: string;
  readonly savedPath: string | null;
  /**
   * 保存先の接続先と、KisaraUI が作ったファイルか。無ければ上書きできない扱い
   */
  readonly savedOn?: string | null | undefined;
  readonly savedOwn?: boolean | undefined;
  readonly dirty: boolean;
  readonly selectedNodeIds: readonly NodeId[];
  /**
   * 隠してよいノード（開いたとき・切り替えたときに決めたもの）
   */
  readonly hiddenCandidates: ReadonlySet<NodeId>;
  readonly appValues: AppValues;
  /**
   * 取り消しの控え。画面の中だけで持ち、保存しない。無ければ空
   */
  readonly history?: GraphHistory | undefined;
  /**
   * 開いていたダイアログと対象。画面の中だけで持ち、保存しない
   */
  readonly dialogs?: Readonly<Record<string, unknown>> | undefined;
}

/** タブバーのタブ 1 つ */
export interface Tab {
  readonly id: string;
  readonly kind: TabKind;
  /**
   * セッションの id。実行を送るときに添え、記録とタスクの列を
   * これで分ける。開いていたタブの控えに一緒に残す
   */
  readonly runSession?: string | undefined;
  /**
   * 写しの元。別のブラウザのタブで開かれていたタブを写したときの、元のタブの
   * 元（たどった先）のセッション。写しでなければ持たない（自分のセッションが元）
   */
  readonly origin?: string | undefined;
  /**
   * 会話のタブの会話の id。会話のストアと置き場の鍵
   */
  readonly chatId?: string | undefined;
  /**
   * 会話の置き場に ComfyUI を含むなら、その接続先。ブラウザだけなら持たない
   */
  readonly chatComfyUrl?: string | undefined;
  /** 会話をブラウザと ComfyUI の両方に置いているか */
  readonly chatBoth?: boolean | undefined;
}

/** タブの並び・アクティブなタブ・控えと、タブの操作（slice が操作を分けて持つ） */
export interface TabsState {
  readonly tabs: readonly Tab[];
  readonly activeId: string;
  /** 非アクティブなタブの中身。アクティブなものはグラフストア側にある */
  readonly snapshots: Readonly<Record<string, TabSnapshot>>;

  /** 空のタブを足して切り替える。返り値は新しいタブの id */
  readonly addTab: () => string;
  /**
   * 会話のタブを足して切り替える。会話の id を渡さなければ新しい会話を作る
   */
  readonly addChatTab: (chatId?: string) => string;
  /**
   * 会話のタブを用意して切り替える。今のタブが空のワークフローのタブなら
   * それを会話のタブに替える（空のタブを残さない）。返り値はそのタブの id
   */
  readonly openChatTab: (init?: {
    readonly profileId: string | null;
    readonly model: string;
  }) => string;
  /**
   * 残した会話を開く。このブラウザのタブで開いていれば、そのタブへ移る。
   * 今のタブが空のワークフローのタブならそれを会話のタブに替え、ほかは新しいタブで開く。
   * 中身は先に会話のストアへ置いておく。返り値はそのタブの id
   */
  readonly openExistingChat: (chatId: string, place?: ChatPlace) => string;
  /**
   * 会話のタブの会話を別の会話に替える。前の会話は手放す（置き場には残る）。
   * 中身は先に会話のストアへ置いておく
   */
  readonly replaceChat: (tabId: string, chatId: string, place?: ChatPlace) => void;
  /**
   * 会話のタブの会話の id を替える（写しを新しい id で持つとき）
   */
  readonly setTabChat: (tabId: string, chatId: string) => void;
  /** 会話の置き場が変わったとき、その会話を開いているタブの置き場を替える */
  readonly setChatPlace: (chatId: string, place: ChatPlace) => void;
  /**
   * 画像のタブを用意して切り替える。今のタブが空のワークフローのタブなら
   * それを使う（開くたびに空タブが残らないように）。返り値はそのタブの id
   */
  readonly openImageTab: (name: string) => string;
  readonly selectTab: (id: string) => void;
  readonly closeTab: (id: string) => void;
  /**
   * タブを並びの `index` 番目へ動かす（ドラッグとメニューの左右へ移す）
   */
  readonly moveTab: (id: string, index: number) => void;
  /**
   * ワークフローを開く前に呼ぶ。**中身のあるタブなら新しいタブを用意**し、
   * 空のタブならそのまま使う（開くたびに空タブが残らないように）
   */
  readonly prepareOpen: () => void;
  /**
   * タブの中身を読む。アクティブなタブは**ストアに載っている今の内容**を返す。
   * 無いタブは null（繰り返し実行が、選んだタブのワークフローを投げるために使う）
   */
  readonly readTab: (id: string) => TabSnapshot | null;
  /**
   * そのタブで生成のたびに変わる値を進める（投入のあと）
   */
  readonly advanceTabSeeds: (id: string, definitions: NodeDefinitionMap) => void;
  /**
   * 隠す相手を全タブで今の線から決め直す（表示の切り替えから）
   */
  readonly refreshHiddenCandidates: () => void;
  /**
   * 端末に残した控えから戻す。
   * `snapshots` には**選ぶタブの中身も含めて**渡す。
   */
  readonly restore: (
    tabs: readonly Tab[],
    activeId: string,
    snapshots: Readonly<Record<string, TabSnapshot>>,
  ) => void;
  /**
   * どのブラウザのタブにも開かれていないタブの中身を、並びの最後に足して開く。
   * セッションの鍵を取れたものだけを足す（同時に開いたほかのブラウザのタブと取り合わない）。
   * 選んでいるタブは変えない。足したセッションを返す
   */
  readonly adopt: (
    entries: readonly { readonly session: string; readonly snapshot: TabSnapshot }[],
  ) => Promise<string[]>;
  /**
   * このブラウザのタブで前に使ったセッション（切り替える前・閉じたタブのもの。新しい順）。
   * タスクの列に出し、記録も書き続ける。ブラウザのタブごとの保存領域に置く
   */
  readonly pastSessions: readonly string[];
  /**
   * そのタブを新しいセッションにする。前の id は `pastSessions` へ
   */
  readonly renewSession: (id: string) => void;
}

/**
 * タブの見出しに要るもの。外殻はこれだけを読む
 */
export interface TabLabel {
  readonly name: string;
  readonly dirty: boolean;
  /** 名前が空のときに出す名前（会話は最初の発言の頭）。無ければ「名称未設定」 */
  readonly fallbackName?: string | undefined;
  /** 受け取り中・実行中など、続いている作業がある（見出しに印を出す） */
  readonly busy?: boolean | undefined;
  /** 印の読み上げ。無ければ「受け取り中」 */
  readonly busyLabel?: string | undefined;
  /** 閉じる前に確かめる文（無ければ保存していない編集の文） */
  readonly closeMessage?: string | undefined;
}

const firstId = nextId();

export const useTabsStore = create<TabsState>()((...store) => ({
  tabs: [{ id: firstId, kind: 'workflow', runSession: newSession() }],
  activeId: firstId,
  snapshots: {},
  pastSessions: readTabList(PAST_SESSIONS_KEY),
  ...createTabsSessionSlice(...store),
  ...createTabsChatSlice(...store),
  ...createTabsSwitchSlice(...store),
}));

/** このブラウザのタブのセッション（すべてのタブのものと、前に使ったもの）。タスクの列に出す範囲 */
export function ownSessions(state: TabsState): readonly string[] {
  const current = state.tabs.flatMap((tab) =>
    tab.runSession === undefined ? [] : [tab.runSession],
  );
  return [...current, ...state.pastSessions.filter((id) => !current.includes(id))];
}

/**
 * 開いているワークフローのタブのセッション。画像のタブなら null
 */
export function activeSession(state: TabsState): string | null {
  const tab = state.tabs.find((item) => item.id === state.activeId);
  return tab?.kind === 'workflow' ? (tab.runSession ?? null) : null;
}

// ─────────────────────────────
// 会話のタブをワークフロー・画像のタブより左へ寄せる（設定で切れる）。
// タブの並びが変わるたびに寄せ直す（足した・種別を替えた・運んだ・開き直した）。それぞれの中の順は保ち、
// 種別をまたいで運んでも境目で止まる。設定を入れたときもその場で寄せる。
// ─────────────────────────────

function arrangeChatTabsFirst(): void {
  if (!useSettingsStore.getState().chatTabsFirst) return;
  const { tabs } = useTabsStore.getState();
  const arranged = stablePartition(tabs, (tab) => tab.kind === 'chat');
  if (arranged !== tabs) useTabsStore.setState({ tabs: arranged });
}

useTabsStore.subscribe((state, previous) => {
  if (state.tabs !== previous.tabs) arrangeChatTabsFirst();
});
useSettingsStore.subscribe((state, previous) => {
  if (state.chatTabsFirst && !previous.chatTabsFirst) arrangeChatTabsFirst();
});
