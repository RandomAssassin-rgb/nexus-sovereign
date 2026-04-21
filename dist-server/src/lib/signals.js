import { freshnessScore, weightedScore, clamp } from './signalMath.js';
const SOURCE_RELIABILITY = {
    'OpenWeatherMap': 85,
    'WAQI': 90,
    'GoogleTraffic': 92,
    'NexusBiometric': 98,
    'PlatformAPI': 80,
    'WorkerConsensus': 70,
};
export class SignalFabric {
    constructor() {
        this.signals = [];
    }
    enrichSignal(signal) {
        const freshness = freshnessScore(signal.observedAt);
        const baseConfidence = SOURCE_RELIABILITY[signal.source] || 50;
        // Confidence Decay: reduced if signal is stale
        const finalConfidence = freshness < 50 ? Math.floor(baseConfidence * 0.7) : baseConfidence;
        return {
            ...signal,
            freshness,
            confidence: finalConfidence,
            provenance: signal.provenance || 'Live', // Default to Live if not specified
            freshnessLabel: freshness > 60 ? 'Fresh' : 'Stale'
        };
    }
    addSignal(signal) {
        this.signals.push(this.enrichSignal(signal));
    }
    getSignals() {
        return this.signals.map(s => ({
            ...s,
            freshness: freshnessScore(s.observedAt)
        }));
    }
    /**
     * Calculates a normalized intensity score across all signals of a specific type.
     */
    getIntensity(type) {
        const relevant = this.signals.filter(s => s.type === type);
        if (relevant.length === 0)
            return 0;
        const parts = relevant.map(s => ({
            score: s.value,
            weight: (s.confidence / 100) * (s.freshness / 100)
        }));
        return weightedScore(parts);
    }
    /**
     * Detects if signals are contradicting each other.
     * Returns a score from 0 (perfect alignment) to 100 (high contradiction).
     */
    calculateContradictionIndex() {
        if (this.signals.length < 2)
            return 0;
        let index = 0;
        const weather = this.getIntensity('weather');
        const traffic = this.getIntensity('traffic');
        const aqi = this.getIntensity('aqi');
        const activity = this.getIntensity('activity');
        // Rule 1: High Weather/AQI intensity vs. High Activity
        // If disruption is high (e.g. heavy rain/aqi), we expect activity to drop.
        // If activity remains high, it might be a simulation or anomaly.
        if ((weather > 70 || aqi > 70) && activity > 70) {
            index += 30;
        }
        // Rule 2: Low Weather intensity vs. High Traffic Disruption
        // If weather is clear but traffic is highly disrupted, verify source.
        if (weather < 20 && traffic > 80) {
            index += 20;
        }
        // Rule 3: Deep Freshness Gap
        // If we have contradictory signals and one is stale, increase index.
        const staleness = 100 - Math.min(...this.signals.map(s => freshnessScore(s.observedAt)));
        if (staleness > 50) {
            index += 10;
        }
        // Rule 4: Behavioral Movement Anomaly (Phase 3 Hardening)
        // Detecting "stateless" movement or "ghost" reporting where activity is reported but device trust is low.
        const deviceSignal = this.signals.find(s => s.type === 'device');
        if (deviceSignal && deviceSignal.value < 40 && activity > 60) {
            index += 25;
        }
        return clamp(index);
    }
    getState() {
        const currentSignals = this.getSignals();
        return {
            signals: currentSignals,
            normalizedScore: weightedScore(currentSignals.map(s => ({
                score: s.value,
                weight: (s.confidence / 100) * (s.freshness / 100)
            }))),
            contradictionIndex: this.calculateContradictionIndex(),
            lastUpdated: new Date().toISOString()
        };
    }
    /**
     * Factory for demo signals
     */
    static createDemoFabric(variant = 'monsoon') {
        const now = new Date().toISOString();
        const fabric = new SignalFabric();
        if (variant === 'monsoon') {
            fabric.addSignal({ id: 's1', type: 'weather', source: 'OpenWeatherMap', value: 85, observedAt: now, metadata: { condition: 'Heavy Rain' }, provenance: 'Live', freshnessLabel: 'Fresh' });
            fabric.addSignal({ id: 's2', type: 'traffic', source: 'GoogleTraffic', value: 70, observedAt: now, metadata: { delay: '45min' }, provenance: 'Live', freshnessLabel: 'Fresh' });
            fabric.addSignal({ id: 's3', type: 'activity', source: 'PlatformAPI', value: 20, observedAt: now, metadata: { surge: '3.5x' }, provenance: 'Live', freshnessLabel: 'Fresh' });
        }
        else if (variant === 'heatwave') {
            fabric.addSignal({ id: 's1', type: 'weather', source: 'OpenWeatherMap', value: 90, observedAt: now, metadata: { temp: '42C' }, provenance: 'Live', freshnessLabel: 'Fresh' });
            fabric.addSignal({ id: 's2', type: 'aqi', source: 'WAQI', value: 65, observedAt: now, metadata: { aqi: 240 }, provenance: 'Live', freshnessLabel: 'Fresh' });
            fabric.addSignal({ id: 's3', type: 'activity', source: 'PlatformAPI', value: 40, observedAt: now, provenance: 'Live', freshnessLabel: 'Fresh' });
        }
        else {
            fabric.addSignal({ id: 's1', type: 'weather', source: 'OpenWeatherMap', value: 10, observedAt: now, metadata: { condition: 'Clear' }, provenance: 'Live', freshnessLabel: 'Fresh' });
            fabric.addSignal({ id: 's2', type: 'activity', source: 'PlatformAPI', value: 85, observedAt: now, provenance: 'Live', freshnessLabel: 'Fresh' });
        }
        return fabric;
    }
}
//# sourceMappingURL=signals.js.map