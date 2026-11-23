const BOTTOM_SLACK = 24;

export function bottomGapOf(element: Element): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

export function isNearBottom(element: Element): boolean {
  return bottomGapOf(element) <= BOTTOM_SLACK;
}
