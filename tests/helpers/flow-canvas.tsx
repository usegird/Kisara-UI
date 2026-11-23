import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect } from 'vitest';

import { FlowCanvas } from '@/components/comfy/flow/FlowCanvas';
import type { WorkflowLinkTuple, WorkflowNode } from '@/graph/types';
import { resetStats, statCount } from '@/lib/perf-stats';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useGraphStore } from '@/store/use-graph-store';

import { definition, definitionMap, socket, widget } from './definitions';
import { stubMissingDom } from './dom';
import { loadDefinitions } from './fixtures';
import { node } from './workflow';

let cardScrollShift = 0;

export function setCardScrollShift(shift: number): void {
  cardScrollShift = shift;
}

function shifted(element: Element, rect: DOMRect): DOMRect {
  if (cardScrollShift === 0 || element.hasAttribute('data-flow-scroll')) return rect;
  if (element.closest('[data-flow-scroll]') === null) return rect;
  const top = rect.top - cardScrollShift;
  return { ...rect, y: top, top, bottom: top + rect.height, toJSON: () => ({}) };
}

function stubRects(): void {
  stubMissingDom();

  let counter = 0;
  const rects = new WeakMap<Element, DOMRect>();
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    const cached = rects.get(this);
    if (cached) return shifted(this, cached);

    if (
      this instanceof Element &&
      (this.hasAttribute('data-variable-panel') ||
        this.hasAttribute('data-flow-scroll') ||
        this.hasAttribute('data-app-scroll'))
    ) {
      const panel = {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 300,
        height: 100000,
        right: 300,
        bottom: 100000,
        toJSON: () => ({}),
      } as DOMRect;
      rects.set(this, panel);
      return panel;
    }

    counter += 1;
    const rect = {
      x: counter * 10,
      y: counter * 20,
      left: counter * 10,
      top: counter * 20,
      width: 100,
      height: 30,
      right: counter * 10 + 100,
      bottom: counter * 20 + 30,
      toJSON: () => ({}),
    } as DOMRect;
    rects.set(this, rect);
    return shifted(this, rect);
  };
}

export function setupFlowCanvas(): void {
  beforeAll(stubRects);
  beforeEach(() => {
    useGraphStore.getState().clear();
    useDefinitionsStore.setState({ definitions: loadDefinitions() });
  });
  afterEach(() => {
    cleanup();
  });
}

export async function settle(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

export const CHAIN_LENGTH = 40;
export const STEP = definition('Step', [socket('in', 'IMAGE'), widget('value', 'INT')], {
  outputs: [{ name: 'out', type: 'IMAGE' }],
});

function chainWorkflow(): { nodes: WorkflowNode[]; links: WorkflowLinkTuple[] } {
  const ids = Array.from({ length: CHAIN_LENGTH }, (_, index) => index + 1);
  const nodes = ids.map((id) =>
    node(id, 'Step', {
      inputs: [{ name: 'in', type: 'IMAGE', link: id > 1 ? id - 1 : null }],
      outputs: [{ name: 'out', type: 'IMAGE', links: id < CHAIN_LENGTH ? [id] : [] }],
      widgets_values: [0],
    }),
  );
  const links = ids.slice(0, -1).map((id): WorkflowLinkTuple => [id, id, 0, id + 1, 0, 'IMAGE']);
  return { nodes, links };
}

export async function settleMeasuring(): Promise<void> {
  for (let round = 0; round < 20; round++) {
    const before = statCount('measure:anchors');
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    if (statCount('measure:anchors') === before) return;
  }
  throw new Error('測り直しが止まらない');
}

export function setupChainCanvas(): void {
  beforeEach(async () => {
    useDefinitionsStore.setState({ definitions: definitionMap(STEP) });
    useExecutionStore.getState().reset();
    useGraphStore.getState().loadWorkflow(chainWorkflow());
    cardScrollShift = 0;
    render(<FlowCanvas />);
    await settleMeasuring();
    resetStats();
  });

  afterEach(() => {
    cardScrollShift = 0;
  });
}

export const FOLLOW = { VariablePanel: 1, ConnectorOverlay: 1, AppInputPanel: 0 };
export const STILL = { VariablePanel: 0, ConnectorOverlay: 0, AppInputPanel: 0 };

export function expectWithinBudget(cards: number, panels: Record<string, number>): void {
  const probe = cards > 0 ? 'NodeCard' : 'ConnectorOverlay';
  expect(statCount(`render:${probe}`), '台帳に届いていない').toBeGreaterThan(0);
  for (const [id, limit] of Object.entries({ NodeCard: cards, ...panels })) {
    expect(statCount(`render:${id}`), id).toBeLessThanOrEqual(limit);
  }
}
