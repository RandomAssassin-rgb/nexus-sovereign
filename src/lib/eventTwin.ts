import { cellToBoundary, gridDisk, latLngToCell } from 'h3-js';
import { SignalFabric } from './signals.js';
import { calculateReservePool, calculatePmax, resolveTriggerKind } from './actuarial.js';

export type EventStatus = 'Active' | 'Pending' | 'Resolved';
export type EventPosture = 'Watch' | 'Elevated' | 'Extreme';
export type EventProvenance = 'Live' | 'Fallback' | 'Simulation';
export type EventFreshness = 'Fresh' | 'Stale';

export interface EventTwinMetrics {
  workers_impacted: number;
  projected_load: number;
  reserve_drawdown_pct: number;
  expected_loss_ratio: number;
  fraud_prob_distribution: Record<string, number>;
}

export interface EventTwin {
  id: string;
  trigger_id: string;
  type: string;
  status: EventStatus;
  posture: EventPosture;
  confidence: number; // 0.0 to 1.0 (derived from Signal Fabric)
  provenance: EventProvenance;
  signal_freshness: EventFreshness;
  projected_payout: number;
  
  footprint: string[]; // H3 cells
  exposure: number; // Number of workers in footprint
  metrics: EventTwinMetrics;
  signals: any; // Snapshotted signal fabric state
  created_at: string;
  updated_at: string;
  expires_at?: string;
  metadata?: Record<string, any>;
}

export class EventTwinManager {
  /**
   * Creates a new Event Twin from a signal fabric and environmental context.
   */
  static async createFromSignal(
    triggerType: string,
    fabric: SignalFabric,
    context: {
      centerLat: number;
      centerLng: number;
      radiusKm: number;
      activeWorkers: any[]; // Full list of workers to filter
      reservePool: number;
      origin?: 'live' | 'simulated' | 'hybrid';
      scenario_id?: string;
      demo_tag?: string;
      created_by?: string;
      expires_at?: string;
    }
  ): Promise<EventTwin> {
    const now = new Date().toISOString();
    const id = `TWIN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    
    // 1. Calculate Footprint (H3)
    const h3Resolution = 8; // Micro-zone resolution
    const centerCell = latLngToCell(context.centerLat, context.centerLng, h3Resolution);
    // Rough approximation of radius in H3 steps (each Level 8 cell is ~0.7km across)
    const kSteps = Math.max(1, Math.round(context.radiusKm / 0.7));
    const footprint = gridDisk(centerCell, kSteps);

    // 2. Identify Exposed Cohort
    const exposedWorkers = context.activeWorkers.filter(w => {
      if (!w.last_lat || !w.last_lng) return false;
      const workerCell = latLngToCell(Number(w.last_lat), Number(w.last_lng), h3Resolution);
      return footprint.includes(workerCell);
    });

    // 3. Estimate Metrics
    const intensity = fabric.getIntensity(triggerType.toLowerCase().includes('rain') ? 'weather' : 'traffic');
    const projectedLoad = exposedWorkers.length * 450 * (intensity / 100); // Rough linear estimate
    const reservePool = calculateReservePool(context.reservePool);
    const drawdown = (projectedLoad / reservePool) * 100;

    // 4. Snapshotted Signals
    const signalState = fabric.getState();

    // 5. Derive Posture based on Intensity
    let posture: EventPosture = 'Watch';
    if (intensity > 75) posture = 'Extreme';
    else if (intensity > 40) posture = 'Elevated';

    // 6. Derive Freshness from Signals
    const isStale = signalState.signals.some(s => s.freshnessLabel === 'Stale');

    return {
      id,
      trigger_id: `TRG-${triggerType.toUpperCase().replace(/\s+/g, '_')}`,
      type: triggerType,
      status: 'Active',
      posture,
      confidence: Number((signalState.normalizedScore / 100).toFixed(2)),
      provenance: context.origin === 'simulated' ? 'Simulation' : context.origin === 'hybrid' ? 'Fallback' : 'Live',
      signal_freshness: isStale ? 'Stale' : 'Fresh',
      projected_payout: Math.round(projectedLoad / exposedWorkers.length || 0),

      footprint,
      exposure: exposedWorkers.length,
      metrics: {
        workers_impacted: exposedWorkers.length,
        projected_load: Math.round(projectedLoad),
        reserve_drawdown_pct: Number(drawdown.toFixed(2)),
        expected_loss_ratio: Number((intensity * 0.8).toFixed(1)), // Modeled ratio
        fraud_prob_distribution: {
          'low': 85,
          'medium': 10,
          'high': 5
        }
      },
      signals: signalState,
      created_at: now,
      updated_at: now,
      expires_at: context.expires_at,
      metadata: {
        center: [context.centerLat, context.centerLng],
        radiusKm: context.radiusKm,
        contradiction_index: signalState.contradictionIndex,
        origin: context.origin,
        scenario_id: context.scenario_id,
        demo_tag: context.demo_tag,
        created_by: context.created_by
      }
    };
  }

  /**
   * Generates a "one-click" audit pack for a twin.
   */
  static generateAuditPack(twin: EventTwin): string {
    return JSON.stringify({
      twin_id: twin.id,
      timestamp: twin.created_at,
      evidence: {
        signals: twin.signals,
        footprint_cells: twin.footprint.length,
        exposure: twin.exposure,
      },
      economics: {
        load: twin.metrics.projected_load,
        drawdown: twin.metrics.reserve_drawdown_pct,
      },
      authenticity_hash: `sha256-${Math.random().toString(36).slice(2)}` // Representative only
    }, null, 2);
  }
}
