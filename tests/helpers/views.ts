import type { NodeRow, NodeView } from '@/graph/rows';

export function nodeRow(overrides: Partial<NodeRow> = {}): NodeRow {
  return {
    name: 'value',
    label: 'value',
    type: 'INT',
    kind: 'widget',
    required: true,
    value: 1,
    source: null,
    options: null,
    target: null,
    widgetName: 'value',
    appInput: false,
    inputSlot: null,
    linkable: true,
    multiline: false,
    number: null,
    height: null,
    imageUpload: false,
    ...overrides,
  };
}

export function nodeView(overrides: Partial<NodeView> = {}): NodeView {
  return {
    id: 1,
    kind: 'node',
    index: '1',
    displayName: 'N1',
    comment: '',
    classType: 'X',
    rows: [],
    outputs: [],
    mode: 0,
    collapsed: false,
    unresolved: false,
    values: [],
    linked: true,
    ...overrides,
  };
}
