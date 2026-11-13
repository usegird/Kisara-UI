import { create } from 'zustand';

import type { RunHistoryEntry, RunHistoryFile } from '@/port/run-history';
import { createRunHistoryFileSlice } from '@/store/slices/run-history-files';
import { createRunHistorySessionSlice } from '@/store/slices/run-history-sessions';

// ─────────────────────────────
// 実行の記録。キューの取り直しのたびに、このブラウザのタブのセッションで送った実行をセッションの
// ファイルへ足し、接続したときと更新を押したときに読む。取得と書き込みは `comfy/`、合わせ方は `queue/`。
// ─────────────────────────────

/** 記録の一覧を読む段階 */
type RunHistoryStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 実行の記録の一覧と中身と、足す・読む操作（slice が操作を分けて持つ） */
export interface RunHistoryState {
  /** 記録のファイルの一覧（名前と時期）。読んだ接続先の分だけ。中身はここからは読まない */
  readonly entries: readonly RunHistoryEntry[];
  /**
   * 読んだ記録（ファイル名 → 中身）。出したカードの分だけ読む
   */
  readonly files: ReadonlyMap<string, RunHistoryFile>;
  readonly status: RunHistoryStatus;
  /** 読めなかった・書けなかった理由。無ければ null */
  readonly error: string | null;
  /**
   * `/history` の応答から、このタブから送った実行を記録に足す。書いた分は表示に足さない
   */
  readonly ingest: (baseUrl: string, raw: unknown) => Promise<void>;
  /** 記録のファイルの一覧を読み直す。読んだ中身は捨てる（出す分は `fetchFiles` で読み直す） */
  readonly load: (baseUrl: string) => Promise<void>;
  /** まだ読んでいないファイルの中身を読む（出すカードの分）。読んでいる最中のものは重ねない */
  readonly fetchFiles: (baseUrl: string, names: readonly string[]) => Promise<void>;
  readonly clear: () => void;
  /**
   * このタブから送った実行を覚える。記録を書くのはこの実行だけで、Workflow JSON も
   * 送ったものを使う（送った後にサーバー側で書き換えられた値を残さない）
   */
  readonly rememberSent: (promptId: string, workflow: unknown) => void;
  /**
   * さかのぼる範囲（記録のファイル名。そのファイルとそれより前に始まったファイルだけを出す）。
   * null なら全部。画面の中だけに持ち、読み直しても保つ
   */
  readonly upTo: string | null;
  readonly setUpTo: (upTo: string | null) => void;
  /**
   * 開いているワークフローのタブのセッションの名前。付けていなければ空
   */
  readonly sessionName: string;
  /**
   * 読んだ・付けたセッションの名前（セッションの id → 名前）。繰り返しのカードが、開いていない
   * タブのセッション名を出すのに使う。画面の中だけに持つ
   */
  readonly sessionNames: ReadonlyMap<string, string>;
  /** 開いているワークフローのタブのセッションの記録を読み、名前を出す（接続・タブやセッションの切り替え） */
  readonly loadSession: (baseUrl: string) => Promise<void>;
  /** 開いているタブのセッションの名前を記録に書く。空なら外す。記録を書かない設定の間は書かない */
  readonly setSessionName: (baseUrl: string, name: string) => Promise<void>;
}

export const useRunHistoryStore = create<RunHistoryState>()((...store) => ({
  entries: [],
  files: new Map(),
  status: 'idle',
  error: null,
  upTo: null,
  sessionName: '',
  sessionNames: new Map(),
  ...createRunHistorySessionSlice(...store),
  ...createRunHistoryFileSlice(...store),
}));
