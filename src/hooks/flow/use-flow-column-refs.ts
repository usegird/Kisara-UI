import { useCallback, useRef } from 'react';

export interface FlowColumnElements {
  readonly flow: HTMLDivElement | null;
  readonly app: HTMLDivElement | null;
  readonly cards: HTMLDivElement | null;
  readonly variables: HTMLDivElement | null;
}

export interface FlowColumnRefs {
  readonly attachFlowScroll: (element: HTMLDivElement | null) => void;
  readonly attachAppScroll: (element: HTMLDivElement | null) => void;
  readonly attachCardScroll: (element: HTMLDivElement | null) => void;
  readonly attachVariableScroll: (element: HTMLDivElement | null) => void;
  readonly holdVariables: (hold: () => () => void) => void;
  readonly startHold: () => (() => void) | undefined;
  readonly columnsNow: () => FlowColumnElements;
  readonly scrollColumns: () => (HTMLDivElement | null)[];
}

export function useFlowColumnRefs(): FlowColumnRefs {
  const cardScroll = useRef<HTMLDivElement | null>(null);
  const appScroll = useRef<HTMLDivElement | null>(null);
  const variableScroll = useRef<HTMLDivElement | null>(null);
  const flowScroll = useRef<HTMLDivElement | null>(null);
  const holding = useRef<(() => () => void) | null>(null);

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
  const columnsNow = useCallback(
    (): FlowColumnElements => ({
      flow: flowScroll.current,
      app: appScroll.current,
      cards: cardScroll.current,
      variables: variableScroll.current,
    }),
    [],
  );
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
