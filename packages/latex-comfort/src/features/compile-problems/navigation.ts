export function cycleProblemIndex(length: number, current: number, delta: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta < 0 ? length - 1 : 0;
  return ((current + delta) % length + length) % length;
}
