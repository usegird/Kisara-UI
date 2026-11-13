import type { AdvisorUse } from '@/chat/prompt-advisor';

// ─────────────────────────────
// プレイブックの形と、標準のプレイブックの形。標準の名前と文は文言の表から引いて写す。
// 辞書の操作は playbook-outline.ts、置く位置は assemble.ts、フェーズの文は playbook-text.ts
// ─────────────────────────────

/**
 * フェーズの種類。決める段は構成の相談、進める・締める段は本体の会話
 */
export type PhaseKind = 'decide' | 'proceed' | 'close';

/**
 * 受け取った応答の使い道。候補を選んで次の指示に添える。記録（重要なメモ）は利用者が
 * カードで書く
 */
export type ResponseUse = 'send';

/** フェーズの操作。送る・構成の相談を開く・次の項目へ */
export type PlaybookAction =
  | {
      readonly kind: 'send';
      readonly id: string;
      readonly name: string;
      /** その 1 回だけ履歴の末尾に `system` で置く文 */
      readonly instruction: string;
      /** 受け取った応答の使い道。無ければなし */
      readonly use?: ResponseUse;
      /** 使い道が候補を添えて送るとき、送る先の操作の id。無ければ続けるの指示で送る */
      readonly sendTo?: string;
      /**
       * 指示の枠でなく入力欄に入れ、生成し直すで直前の本文を作り直す指示にする。使い道とは
       * 併せない
       */
      readonly revise?: true;
    }
  | {
      readonly kind: 'consult';
      readonly id: string;
      readonly name: string;
      /** 相談の初期メッセージに出す文（画面の言語） */
      readonly greeting: string;
      /** 相談の付加情報に入れる勘所 */
      readonly instruction: string;
      /** 段ごとのプロンプトをアウトラインの辞書に書かせるか */
      readonly outline: boolean;
    }
  | { readonly kind: 'next'; readonly id: string; readonly name: string };

/** 送るの操作 */
export type PlaybookSendAction = Extract<PlaybookAction, { kind: 'send' }>;
/** 構成の相談を開く操作 */
export type PlaybookConsultAction = Extract<PlaybookAction, { kind: 'consult' }>;

/**
 * フェーズでのアウトラインの段の選び方。アウトラインはどのフェーズでも出す。
 * 1 つを選ぶ（今の段）・いくつでも選べる・読むだけ（印は出すが変えられない）
 */
export type OutlineView = 'single' | 'multi' | 'readonly';

export const OUTLINE_VIEWS: readonly OutlineView[] = ['single', 'multi', 'readonly'];

/**
 * 種類ごとの既定。決める段は読むだけ（段はサブセッションで作るので、選ばせない）、進める段は 1 つを選び、
 * 締める段はいくつでも選べる
 */
export function defaultOutlineView(kind: PhaseKind): OutlineView {
  if (kind === 'decide') return 'readonly';
  return kind === 'close' ? 'multi' : 'single';
}

/** プレイブックのフェーズ 1 つ。種類・目的の 1 行・操作の並び */
export interface PlaybookPhase {
  readonly id: string;
  readonly name: string;
  readonly kind: PhaseKind;
  /** アウトラインの出し方 */
  readonly outline: OutlineView;
  /** 1 行。フェーズの文に入れて送る。利用者がこのフェーズで送る発言の向け先も書く */
  readonly goal: string;
  /** 先頭が主の操作。無くてもよい（進める段なら続きを書くが主の操作になる） */
  readonly actions: readonly PlaybookAction[];
}

/** フェーズの文の見出しの語（送る文。画面の言語で写す） */
interface PlaybookLabels {
  readonly playbook: string;
  readonly role: string;
  readonly phase: string;
  /** 候補を添えて送るときの見出し */
  readonly picked: string;
}

/** 文言を引いた後のプレイブックの定義 1 つ。役割の文・フェーズ・常設の操作を持つ */
export interface Playbook {
  /** 写した元の id（標準か自分のもの） */
  readonly id: string;
  /** 写した元が標準か自分のものか */
  readonly origin: 'builtin' | 'own';
  readonly name: string;
  readonly description: string;
  /** アシスタントがすること・しないこと。フェーズの文と一緒に毎回送る。空でもよい */
  readonly role: string;
  /**
   * カードの「続きを書く」と、送る先の無い候補を送るときの指示
   */
  readonly continue: string;
  /** 構成の相談を開くときの用途（相談の勘所と、変えてよい所を決める） */
  readonly advisor: AdvisorUse;
  /** 1 件以上 */
  readonly phases: readonly PlaybookPhase[];
  /** どのフェーズでも出す操作（送るだけ） */
  readonly standing: readonly PlaybookSendAction[];
  readonly labels: PlaybookLabels;
}

/**
 * 会話が持つプレイブック。どのプレイブックか（標準か自分のものかと id）と今のフェーズだけ。
 * 写しは持たず、定義はその都度いちばん新しいものを引く。アウトラインと重要なメモは予約の辞書
 * `##playbook` に持つ（playbook-outline.ts）
 */
export interface ChatPlaybookRef {
  readonly origin: 'builtin' | 'own';
  readonly id: string;
  /** 今のフェーズの id */
  readonly phase: string;
}

/** 引いた定義と今のフェーズ（送る中身を組むとき・画面に出すときに使う。保存しない） */
export interface ChatPlaybook {
  readonly playbook: Playbook;
  /** 今のフェーズの id */
  readonly phase: string;
}

/**
 * 操作で送った `user` の発言が持つ記録。`direction` の発言は本文そのものが `<direction>` で囲んだ指示で、
 * `content` は空
 */
export interface PlaybookInstruction {
  /** 操作の名前（画面に出す。入力欄から送った指示は空） */
  readonly name: string;
  readonly content: string;
  /** 送った操作の id（応答の使い道を写しから引く） */
  readonly action?: string;
  /** 本文を `<direction>` で囲んだ指示の発言か */
  readonly direction?: true;
}

// ─────────────────────────────
// 標準のプレイブック。操作の並びと文はプレイブックごとのページにある
// ─────────────────────────────

type ActionShape =
  | {
      readonly kind: 'send';
      readonly id: string;
      readonly use?: ResponseUse;
      readonly sendTo?: string;
      readonly revise?: true;
    }
  | { readonly kind: 'consult'; readonly id: string; readonly outline: boolean };

interface PhaseShape {
  readonly id: string;
  readonly kind: PhaseKind;
  readonly actions: readonly ActionShape[];
}

interface PlaybookShape {
  readonly id: string;
  readonly advisor: AdvisorUse;
  readonly phases: readonly PhaseShape[];
  /** 共通の操作の id（文言は `llm.playbook.shared` の下） */
  readonly standing: readonly string[];
}

const send = (
  id: string,
  options: { use?: ResponseUse; sendTo?: string; revise?: true } = {},
): ActionShape => ({
  kind: 'send',
  id,
  ...options,
});
/** 相談の操作。`outline` はアウトラインの段を書かせる */
const consult = (id: string, outline = false): ActionShape => ({ kind: 'consult', id, outline });
const phase = (id: string, kind: PhaseKind, actions: readonly ActionShape[]): PhaseShape => ({
  id,
  kind,
  actions,
});

/**
 * 決める段は多くても 1 つにし、1 つの相談（サブセッション）の中で段階を踏み、アウトラインの段を書かせる。
 * アウトラインを作る相談は、どのプレイブックでも 1 つだけ
 */
const prepare = phase('prepare', 'decide', [consult('makePlan', true)]);

// 段はアウトラインの見出しの › で進めるので、「次の段へ」の操作は置かない

/** 直前の応答を入力欄の指示で作り直す操作（プロット進行の執筆） */
const revise = send('revise', { revise: true });

/** 標準のプレイブックの形（並びはこの順） */
export const BUILTIN_PLAYBOOKS: readonly PlaybookShape[] = [
  {
    // 筋に沿って書くか、流れだけ固めるかはプロットの相談で決める。プロットを直すときにフェーズを
    // 戻らずに済むよう、相談と書く操作を 1 つのフェーズに置く
    id: 'story',
    advisor: 'story',
    phases: [
      // 展開の候補は本文の会話で相談することになるので、操作に置かない
      phase('writing', 'proceed', [
        consult('makePlan', true),
        revise,
        send('deepen'),
        send('shake'),
        send('shift'),
        send('widen'),
        send('close'),
      ]),
    ],
    // 展開を変える・偶然の出来事は型の「揺さぶる」が受け持つので、常設の操作は置かない
    standing: [],
  },
  {
    id: 'roleplay',
    advisor: 'roleplay',
    phases: [
      prepare,
      phase('scene', 'proceed', [send('moveIdeas', { use: 'send' })]),
      phase('closing', 'close', [send('closeScene'), send('checkVoice')]),
    ],
    standing: ['changeScene', 'accident'],
  },
  {
    // 案を出す切り口（観点）を、枠の相談でアウトラインの段にする
    id: 'ideas',
    advisor: 'work',
    phases: [
      phase('frame', 'decide', [consult('shapeFrame', true)]),
      phase('diverge', 'proceed', [send('generate')]),
      phase('provoke', 'proceed', [send('objections'), send('reverse')]),
      phase('converge', 'proceed', [
        send('themes'),
        send('narrow', { use: 'send', sendTo: 'capture' }),
      ]),
      phase('capture', 'close', [send('capture')]),
    ],
    standing: ['assumptions'],
  },
  {
    id: 'research',
    advisor: 'work',
    phases: [
      phase('questions', 'decide', [consult('makeQuestions', true)]),
      phase('gather', 'proceed', [send('answer')]),
      phase('summarize', 'close', [send('summarize')]),
      phase('verify', 'close', [send('verify')]),
    ],
    standing: ['assumptions', 'plain'],
  },
  {
    id: 'document',
    advisor: 'work',
    phases: [
      prepare,
      phase('sections', 'proceed', [
        send('writeSection'),
        send('contentIdeas', { use: 'send', sendTo: 'writeSection' }),
      ]),
      phase('readerTest', 'close', [send('readerQuestions'), send('reviewAll')]),
    ],
    standing: ['plain'],
  },
];

/** 標準のプレイブックの文言の道筋（文言の表の `llm.playbook` の下） */
type PlaybookTextPath = `llm.playbook.${string}`;

/** フェーズの文の見出しの語を、画面の言語の文言の表から引く */
function playbookLabels(text: (path: PlaybookTextPath) => string): PlaybookLabels {
  const label = (key: keyof PlaybookLabels): string => text(`llm.playbook.frame.${key}`);
  return {
    playbook: label('playbook'),
    role: label('role'),
    phase: label('phase'),
    picked: label('picked'),
  };
}

/**
 * 標準のプレイブックを、文言を引いて写せる形にする。`text` は文言の道筋から文を返す
 * （画面の言語の文言の表）
 */
export function resolvePlaybook(
  shape: PlaybookShape,
  text: (path: PlaybookTextPath) => string,
): Playbook {
  const base = `llm.playbook.builtin.${shape.id}` as const;
  const action = (item: ActionShape): PlaybookAction => {
    const at = `${base}.actions.${item.id}` as const;
    const name = text(`${at}.name`);
    if (item.kind === 'send') return { ...item, name, instruction: text(`${at}.instruction`) };
    return {
      ...item,
      name,
      greeting: text(`${at}.greeting`),
      instruction: text(`${at}.instruction`),
    };
  };
  return {
    id: shape.id,
    origin: 'builtin',
    name: text(`${base}.name`),
    description: text(`${base}.description`),
    role: text(`${base}.role`),
    continue: text(`${base}.continue`),
    advisor: shape.advisor,
    phases: shape.phases.map((item) => ({
      id: item.id,
      kind: item.kind,
      outline: defaultOutlineView(item.kind),
      name: text(`${base}.phases.${item.id}.name`),
      goal: text(`${base}.phases.${item.id}.goal`),
      actions: item.actions.map(action),
    })),
    standing: shape.standing.map((id) => ({
      kind: 'send',
      id,
      name: text(`llm.playbook.shared.${id}.name`),
      instruction: text(`llm.playbook.shared.${id}.instruction`),
    })),
    labels: playbookLabels(text),
  };
}

/**
 * 選ぶ所に出さない標準のプレイブック（保留）。選んでいた会話では、これまでどおり引ける
 */
export const HELD_PLAYBOOK_IDS: readonly string[] = ['roleplay', 'ideas', 'research', 'document'];

/** 写しの中の操作を id で引く（フェーズの操作と常設の操作から） */
export function findAction(playbook: Playbook, id: string): PlaybookAction | undefined {
  for (const item of playbook.phases) {
    const found = item.actions.find((action) => action.id === id);
    if (found !== undefined) return found;
  }
  return playbook.standing.find((action) => action.id === id);
}
