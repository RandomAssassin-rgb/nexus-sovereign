export function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}
export function average(values) {
    if (!values.length)
        return 0;
    return values.reduce((sum, current) => sum + current, 0) / values.length;
}
export function freshnessScore(observedAt, maxAgeMinutes = 60) {
    if (!observedAt)
        return 0;
    const observed = new Date(observedAt).getTime();
    const now = Date.now();
    const ageMinutes = Math.max(0, (now - observed) / 60000);
    const score = 100 - (ageMinutes / maxAgeMinutes) * 100;
    return clamp(score);
}
export function weightedScore(parts) {
    const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
    if (totalWeight <= 0)
        return 0;
    const weighted = parts.reduce((sum, part) => sum + part.score * part.weight, 0);
    return clamp(weighted / totalWeight);
}
//# sourceMappingURL=signalMath.js.map