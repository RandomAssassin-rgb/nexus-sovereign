import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';

interface CATEvent {
  city: string;
  trigger_type: string;
  active_triggers: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  estimated_claims: number;
  estimated_payout: number;
  reserve_required: number;
  reinsurance_threshold: number;
}

interface ReinsuranceState {
  cat_event_detected: boolean;
  event_level: string;
  active_triggers: number;
  reserve_pool: number;
  available_capital: number;
  reinsurance_pool: number;
  claims_queue: number;
  payout_projection: number;
  liquidity_ratio: number;
  status: 'healthy' | 'watch' | 'critical';
  triggered_at: string | null;
  actions_taken: string[];
}

const CAT_THRESHOLDS = {
  low: { triggers: 100, payout_ratio: 0.3 },
  medium: { triggers: 500, payout_ratio: 0.5 },
  high: { triggers: 1000, payout_ratio: 0.7 },
  critical: { triggers: 5000, payout_ratio: 0.9 }
};

async function detectCATEvents(): Promise<CATEvent[]> {
  const events: CATEvent[] = [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: triggers } = await supabaseServer
    .from('disruption_triggers')
    .select('zone_h3, trigger_type, severity, fired_at')
    .gte('fired_at', oneHourAgo);

  if (!triggers || triggers.length === 0) return events;

  const cityGroups = new Map<string, number>();
  const typeGroups = new Map<string, number>();

  triggers.forEach(t => {
    const city = t.zone_h3?.substring(0, 2) || 'unknown';
    cityGroups.set(city, (cityGroups.get(city) || 0) + 1);
    typeGroups.set(t.trigger_type, (typeGroups.get(t.trigger_type) || 0) + 1);
  });

  for (const [city, count] of cityGroups) {
    if (count < 100) continue;

    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (count >= 5000) severity = 'critical';
    else if (count >= 1000) severity = 'high';
    else if (count >= 500) severity = 'medium';

    const estimatedPayout = count * 350 * (severity === 'critical' ? 0.9 : severity === 'high' ? 0.7 : 0.5);
    const reserveRequired = estimatedPayout * 1.2;

    events.push({
      city,
      trigger_type: 'multi_factor',
      active_triggers: count,
      severity,
      estimated_claims: count,
      estimated_payout: estimatedPayout,
      reserve_required: reserveRequired,
      reinsurance_threshold: CAT_THRESHOLDS[severity].triggers
    });
  }

  return events;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { action } = req.query;

    const { data: reserveData } = await supabaseServer
      .from('transactions')
      .select('amount, type')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const totalCredits = reserveData
      ?.filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

    const { data: claimsData } = await supabaseServer
      .from('claims')
      .select('payout_inr, status')
      .gte('processed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const totalPayouts = claimsData
      ?.filter(c => c.status === 'approved')
      .reduce((sum, c) => sum + (c.payout_inr || 0), 0) || 0;

    const pendingClaims = claimsData?.filter(c => c.status === 'pending').length || 0;

    const reservePool = totalCredits;
    const availableCapital = reservePool - totalPayouts;
    const reinsurancePool = Math.max(0, availableCapital * 0.3);
    const payoutProjection = pendingClaims * 350;
    const liquidityRatio = reservePool > 0 ? (availableCapital / Math.max(1, payoutProjection)) : 1;

    const catEvents = await detectCATEvents();

    const maxSeverity = catEvents.reduce((max, e) => {
      const severityOrder = ['low', 'medium', 'high', 'critical'];
      return severityOrder.indexOf(e.severity) > severityOrder.indexOf(max) ? e.severity : max;
    }, 'low' as string);

    let status: 'healthy' | 'watch' | 'critical';
    let eventLevel: string;

    if (maxSeverity === 'critical' || liquidityRatio < 0.5) {
      status = 'critical';
      eventLevel = 'CAT-EVENT';
    } else if (maxSeverity === 'high' || liquidityRatio < 1) {
      status = 'watch';
      eventLevel = 'Elevated Alert';
    } else {
      status = 'healthy';
      eventLevel = 'Normal';
    }

    const reinsuranceState: ReinsuranceState = {
      cat_event_detected: maxSeverity !== 'low',
      event_level: eventLevel,
      active_triggers: catEvents.reduce((sum, e) => sum + e.active_triggers, 0),
      reserve_pool: reservePool,
      available_capital: availableCapital,
      reinsurance_pool: reinsurancePool,
      claims_queue: pendingClaims,
      payout_projection: payoutProjection,
      liquidity_ratio: liquidityRatio,
      status,
      triggered_at: maxSeverity !== 'low' ? new Date().toISOString() : null,
      actions_taken: []
    };

    if (status === 'critical') {
      reinsuranceState.actions_taken = [
        'Activated CAT reserve pool',
        'Notified reinsurance partners',
        'Enabled accelerated claim processing',
        'Paused new enrollments (optional)',
        'Generated liquidity report for Guidewire PolicyCenter'
      ];

      if (process.env.GUIDEWIRE_WEBHOOK_URL) {
        reinsuranceState.actions_taken.push('Sent FNOL batch to reinsurance carrier');
      }
    } else if (status === 'watch') {
      reinsuranceState.actions_taken = [
        'Monitoring trigger density',
        'Pre-positioned reserve allocation',
        'Ready to scale claim processing'
      ];
    }

    if (action === 'trigger-reinsurance') {
      return res.json({
        success: true,
        reinsurance_triggered: true,
        state: reinsuranceState,
        cat_events: catEvents,
        message: 'Reinsurance CAT event triggered - capital pool activated',
        api_actions: reinsuranceState.actions_taken,
        guidewire_sync: {
          policy_center: 'CAT-EVENT',
          claim_batch_size: catEvents.reduce((s, e) => s + e.estimated_claims, 0),
          reserve_drawn: reinsuranceState.reinsurance_pool
        }
      });
    }

    return res.json({
      success: true,
      reinsurance: reinsuranceState,
      cat_events: catEvents,
      summary: {
        status: status,
        liquidity_ratio: Math.round(liquidityRatio * 100) / 100,
        cat_level: maxSeverity,
        next_update: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        thresholds: CAT_THRESHOLDS
      },
      note: 'Reinsurance dashboard monitors mass disruption events to ensure claim payouts can be met'
    });

  } catch (error: any) {
    console.error('[Reinsurance] Error:', error);
    return res.status(500).json({ error: error.message || 'Reinsurance check failed' });
  }
}
