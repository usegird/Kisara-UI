const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function splitMarkdownBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  let blank = false;

  const close = (): void => {
    const block = current.join('\n').trim();
    if (block.length > 0) blocks.push(block);
    current = [];
  };

  for (const line of lines) {
    const marker = FENCE.exec(line)?.[1];
    if (fence === null) {
      const isBlank = line.trim().length === 0;
      if (!isBlank && blank && !/^[ \t]/.test(line)) close();
      if (marker !== undefined) fence = marker;
      blank = isBlank;
    } else if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
      fence = null;
      blank = false;
    }
    current.push(line);
  }
  close();
  return blocks;
}
