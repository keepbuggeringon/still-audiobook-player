export function confirmedSeek(from: number, target: number, actual: number) {
  return Number.isFinite(actual) && actual > from + .05 && Math.abs(actual - target) <= .35;
}
