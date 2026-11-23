export function stepPowerOfTwo(value: number, direction: 1 | -1): number {
  if (direction > 0) return 2 ** (Math.floor(Math.log2(Math.max(value, 1))) + 1);
  return Math.max(1, 2 ** (Math.ceil(Math.log2(Math.max(value, 1))) - 1));
}
