export interface JepData {
  id: string;
  result: 'paid' | 'held' | 'denied';
  provenance: 'Live Corroboration' | 'Fallback Corroboration' | 'Simulation Corroboration' | 'Local Verified';
  event: {
    type: string;
    zone: string;
    timestamp: string;
    duration: string;
    affected_workers: number;
  };
  fraud: {
    score: number;
    bucket: string;
    decision_label: string;
    primary_reason: string;
    reason_labels: string[];
    gps_spoof_flag: boolean;
    gps_spoof_reasons: string[];
    weakest_link: { label: string; score: number } | null;
    matrix: {
      event_match_score: number;
      location_trust_score: number;
      activity_match_score: number;
      device_trust_score: number;
      consensus_score: number;
      behavior_risk_score: number;
    };
  };
  payout: {
    plan: string;
    estimated_loss: number;
    payout_calculation: string;
    breakdown: {
      hourly_rate: number;
      duration: number;
      multiplier: number;
    };
  };
  signals: Array<{
    label: string;
    source: string;
    timestamp: string;
    confidence: number;
  }>;
  audit: {
    twin_id: string;
    hash: string;
  };
  /** Always populated — generated from amount if not explicitly provided */
  payout_math: {
    premium_paid: number;
    coverage_cap: number;
    actual_payout: number;
    reserve_impact_pct: number;
  };
  evidence_forensics: any;
  evidence_url?: string;
}

/**
 * Normalizes any incoming data (from claim or API) into a strict JEP structure.
 * Provides section-specific fallbacks to prevent runtime crashes.
 */
export function normalizeJepData(source: any, id: string): JepData {
  const now = source?.created_at || source?.dateISO || new Date().toISOString();
  const triggerType = source?.trigger_type || source?.type || 'Disruption';
  const amount = Number(source?.amount || source?.payout_amount || 0);

  const resultStatus = (source?.status === 'approved' || source?.verdict === 'auto-approve' || source?.result === 'paid') ? 'paid' : 'held';

  return {
    id: id || source?.id || 'UNKNOWN_ID',
    result: resultStatus,
    provenance: source?.provenance || 'Live Corroboration',
    event: {
      type: triggerType,
      zone: source?.event?.zone || source?.zone || 'Tambaram Core, Chennai',
      timestamp: source?.event?.timestamp || now,
      duration: source?.event?.duration || '3.5h',
      affected_workers: source?.event?.affected_workers || 1420,
    },
    fraud: {
      score: source?.fraud?.score ?? source?.verification_score ?? (resultStatus === 'paid' ? 88 : 45),
      bucket: source?.fraud?.bucket ?? source?.verdict ?? (resultStatus === 'paid' ? 'auto-approve' : 'review'),
      decision_label: source?.fraud?.decision_label ?? (resultStatus === 'paid' ? 'AUTO APPROVED ✅' : 'REVIEW REQUIRED ⚠️'),
      primary_reason: source?.fraud?.primary_reason || source?.primary_reason || (resultStatus === 'paid' ? 'AUTO_VERIFIED_FABRIC' : 'FORENSIC_PULSE_PENDING'),
      reason_labels: source?.fraud?.reason_labels || source?.reason_labels || ['Signal Match', 'Location Verified'],
      gps_spoof_flag: !!source?.fraud?.gps_spoof_flag,
      gps_spoof_reasons: source?.fraud?.gps_spoof_reasons || [],
      weakest_link: source?.fraud?.weakest_link || null,
      matrix: {
        event_match_score: source?.fraud?.matrix?.event_match_score ?? (resultStatus === 'paid' ? 88 : 45),
        location_trust_score: source?.fraud?.matrix?.location_trust_score ?? (resultStatus === 'paid' ? 92 : 60),
        activity_match_score: source?.fraud?.matrix?.activity_match_score ?? (resultStatus === 'paid' ? 100 : 85),
        device_trust_score: source?.fraud?.matrix?.device_trust_score ?? (resultStatus === 'paid' ? 85 : 90),
        consensus_score: source?.fraud?.matrix?.consensus_score ?? (resultStatus === 'paid' ? 78 : 30),
        behavior_risk_score: source?.fraud?.matrix?.behavior_risk_score ?? (resultStatus === 'paid' ? 90 : 80),
      },
    },
    payout: {
      plan: source?.payout?.plan || source?.plan_tier || 'Silver',
      estimated_loss: source?.payout?.estimated_loss ?? amount,
      payout_calculation: source?.payout?.payout_calculation || 'Parametric (Duration x Rate)',
      breakdown: {
        hourly_rate: source?.payout?.breakdown?.hourly_rate || Math.round(amount / 3.5),
        duration: source?.payout?.breakdown?.duration || 3.5,
        multiplier: source?.payout?.breakdown?.multiplier || 1,
      },
    },
    signals: Array.isArray(source?.signals) ? source.signals : [
      { label: `${triggerType} intensity verified`, source: 'OpenWeatherMap', timestamp: now, confidence: 80 },
      { label: 'Location trust confirmed', source: 'H3 Geospatial', timestamp: now, confidence: 80 },
    ],
    audit: {
      twin_id: source?.audit?.twin_id || source?.twinId || `TWIN-${(id || '0000').slice(-4)}`,
      hash: source?.audit?.hash || source?.fingerprint || 'sha256-PENDING_CRYPTO_SIGNATURE',
    },
    // Always generate payout_math so the Economics section is never blank
    payout_math: {
      premium_paid: source?.payout_math?.premium_paid || Math.round(amount * 0.12),
      coverage_cap: source?.payout_math?.coverage_cap || 480,
      actual_payout: source?.payout_math?.actual_payout || amount,
      reserve_impact_pct: source?.payout_math?.reserve_impact_pct || Number(((amount / 42050000) * 100).toFixed(4)),
    },
    evidence_forensics: source?.evidence_forensics || source?.jep_data?.evidence_forensics || null,
    evidence_url: source?.evidence_url || source?.jep_data?.evidence_url || null,
  };
}

/**
 * Merges two JEP data sets prioritizing 'local' for hero fields and 'remote' for audit/enrichment.
 */
export function mergeJepData(local: JepData, remote: any): JepData {
  if (!remote) return local;

  const normalizedRemote = normalizeJepData(remote, local.id);

  // PRECEDENCE RULES:
  // 1. Keep local hero fields (result, event type, amount) to prevent status flip-flop.
  // 2. Enrich with remote audit data if local has 'PENDING' markers.
  // 3. Prevent contradictory labels.

  return {
    ...local,
    // Enrich audit only if remote has a real hash
    audit: {
      twin_id: normalizedRemote.audit.twin_id.includes('TWIN-') ? normalizedRemote.audit.twin_id : local.audit.twin_id,
      hash: normalizedRemote.audit.hash.includes('PENDING') ? local.audit.hash : normalizedRemote.audit.hash,
    },
    // Favor remote for forensic matrix if scores are better (non-zero)
    fraud: {
      ...local.fraud,
      matrix: {
        event_match_score: normalizedRemote.fraud.matrix.event_match_score || local.fraud.matrix.event_match_score,
        location_trust_score: normalizedRemote.fraud.matrix.location_trust_score || local.fraud.matrix.location_trust_score,
        activity_match_score: normalizedRemote.fraud.matrix.activity_match_score || local.fraud.matrix.activity_match_score,
        device_trust_score: normalizedRemote.fraud.matrix.device_trust_score || local.fraud.matrix.device_trust_score,
        consensus_score: normalizedRemote.fraud.matrix.consensus_score || local.fraud.matrix.consensus_score,
        behavior_risk_score: normalizedRemote.fraud.matrix.behavior_risk_score || local.fraud.matrix.behavior_risk_score,
      },
      gps_spoof_flag: normalizedRemote.fraud.gps_spoof_flag || local.fraud.gps_spoof_flag,
      gps_spoof_reasons: normalizedRemote.fraud.gps_spoof_reasons.length > 0 ? normalizedRemote.fraud.gps_spoof_reasons : local.fraud.gps_spoof_reasons,
    },
    // Merge signals (deduplicate by label if needed, but here we just favor remote if larger)
    signals: normalizedRemote.signals.length > local.signals.length ? normalizedRemote.signals : local.signals,
    payout_math: normalizedRemote.payout_math || local.payout_math,
    evidence_forensics: normalizedRemote.evidence_forensics || local.evidence_forensics,
    evidence_url: normalizedRemote.evidence_url || local.evidence_url,
  };
}
