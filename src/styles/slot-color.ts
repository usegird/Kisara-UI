const KNOWN_SLOTS = new Set([
  'clip',
  'clip_vision',
  'clip_vision_output',
  'conditioning',
  'control_net',
  'image',
  'latent',
  'mask',
  'model',
  'style_model',
  'vae',
  'noise',
  'guider',
  'sampler',
  'sigmas',
  'taesd',
]);

export function slotColor(type: string): string {
  const key = type.toLowerCase();
  if (!KNOWN_SLOTS.has(key)) return 'var(--color-slot-default)';

  return `var(--color-slot-${key.replaceAll('_', '-')})`;
}

export function anchorColor(types: readonly string[]): string {
  const unique = new Set(types.map((type) => type.toLowerCase()));
  const only = [...unique][0];

  return unique.size === 1 && only !== undefined ? slotColor(only) : 'var(--color-slot-default)';
}
