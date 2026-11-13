import { useCallback, useRef } from 'react';

// ─────────────────────────────
// フロー画面の列の要素の控え。受け口は作り直さず、手続きからは `columnsNow` で今の要素を読む。
// ─────────────────────────────

/** 今の列の要素 */
export interface FlowColumnElements {
  /** 全体を横に送る枠 */
  readonly flow: HTMLDivElement | null;
  readonly app: HTMLDivElement | null;
  readonly cards: HTMLDivElement | null;
  readonly variables: HTMLDivElement | null;
}

/** 列の要素の受け口と、今の要素を読む手続き。どれも作り直さない */
export interface FlowColumnRefs {
  readonly attachFlowScroll: (element: HTMLDivElement | null) => void;
  readonly attachAppScroll: (element: HTMLDivElement | null) => void;
  readonly attachCardScroll: (element: HTMLDivElement | null) => void;
  readonly attachVariableScroll: (element: HTMLDivElement | null) => void;
  readonly holdVariables: (hold: () => () => void) => void;
  /** 変数の列の連動を止める。受け取っていなければ何もしない */
  readonly startHold: () => (() => void) | undefined;
  readonly columnsNow: () => FlowColumnElements;
  readonly scrollColumns: () => (HTMLDivElement | null)[];
}

/** 列の要素を控える受け口を作る */
export function useFlowColumnRefs(): FlowColumnRefs {
  // 線のエリアで回したホイールを流す先
  const cardScroll = useRef<HTMLDivElement | null>(null);
  const appScroll = useRef<HTMLDivElement | null>(null);
  const variableScroll = useRef<HTMLDivElement | null>(null);
  /** 全体を横に送る枠 */
  const flowScroll = useRef<HTMLDivElement | null>(null);
  /** 変数の列の連動を止める（線を押して揃えている間） */
  const holding = useRef<(() => () => void) | null>(null);

  // ref のコールバックと、変数の列が effect で受け取る `holdVariables` は、作り直すと付け外しが
  // 起きるので compiler に任せず手で固定する
  const attachFlowScroll = useCallback((element: HTMLDivElement | null) => {
    flowScroll.current = element;
  }, []);
  const attachAppScroll = useCallback((element: HTMLDivElement | null) => {
    appScroll.current = element;
  }, []);
  const attachCardScroll = useCallback((element: HTMLDivElement | null) => {
    cardScroll.current = element;
  }, []);
  const attachVariableScroll = useCallback((element: HTMLDivElement | null) => {
    variableScroll.current = element;
  }, []);
  const holdVariables = useCallback((hold: () => () => void) => {
    holding.current = hold;
  }, []);
  const startHold = useCallback(() => holding.current?.(), []);
  // 手続きが読む今の要素。ここ以外から ref に触らない（compiler が ref と見分けられなくなり、
  // 渡した先の手続きが作り直されて描き直しが増える）
  const columnsNow = useCallback(
    (): FlowColumnElements => ({
      flow: flowScroll.current,
      app: appScroll.current,
      cards: cardScroll.current,
      variables: variableScroll.current,
    }),
    [],
  );
  /** 掴んだまま端へ寄せたときに送る候補の列 */
  const scrollColumns = (): (HTMLDivElement | null)[] => [
    appScroll.current,
    cardScroll.current,
    variableScroll.current,
  ];

  return {
    attachFlowScroll,
    attachAppScroll,
    attachCardScroll,
    attachVariableScroll,
    holdVariables,
    startHold,
    columnsNow,
    scrollColumns,
  };
}
