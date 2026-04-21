export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, current) => sum + current, 0) / values.length;
}

export function freshnessScore(observedAt?: string | Date, maxAgeMinutes = 60): number {
  if (!observedAt) return 0;
  const observed = new Date(observedAt).getTime();
  const now = Date.now();
  const ageMinutes = Math.max(0, (now - observed) / 60000);
  const score = 100 - (ageMinutes / maxAgeMinutes) * 100;
  return clamp(score);
}

export function weightedScore(parts: Array<{ score: number; weight: number }>): number {
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = parts.reduce((sum, part) => sum + part.score * part.weight, 0);
  return clamp(weighted / totalWeight);
}
