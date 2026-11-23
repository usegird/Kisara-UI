type SampleImageKind = 'edges' | 'first' | 'final';

const IMAGES = import.meta.glob<string>('./images/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const SAMPLE_SETS = 4;

export function sampleImage(set: number, kind: SampleImageKind): string | undefined {
  const index = ((set % SAMPLE_SETS) + SAMPLE_SETS) % SAMPLE_SETS;
  return IMAGES[`./images/run${String(index + 1)}-${kind}.jpg`];
}

const SAMPLE_OUTPUT_KINDS: Readonly<Record<string, SampleImageKind>> = {
  '11': 'edges',
  '15': 'first',
};

export function outputKind(nodeId: string): SampleImageKind {
  return SAMPLE_OUTPUT_KINDS[nodeId] ?? 'final';
}
