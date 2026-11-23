export function directoryCycle(
  pinned: boolean,
  shown: boolean,
): { readonly pin?: boolean; readonly shown: boolean } {
  if (pinned) return { pin: false, shown: false };
  return shown ? { pin: true, shown: false } : { shown: true };
}

export function directoryStateOf(pinned: boolean, shown: boolean): 'pinned' | 'shown' | 'hidden' {
  if (pinned) return 'pinned';
  return shown ? 'shown' : 'hidden';
}
