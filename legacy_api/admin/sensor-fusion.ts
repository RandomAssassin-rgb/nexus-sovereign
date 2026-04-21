import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';

interface DeviceTelemetry {
  barometer_altitude?: number;
  battery_temperature?: number;
  battery_level?: number;
  is_charging?: boolean;
  gps_altitude?: number;
  gps_accuracy?: number;
  screen_brightness?: number;
}

interface FraudSignal {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: Record<string, any>;
  confidence: number;
  verdict: 'pass' | 'review' | 'flag';
}

function analyzeBarometerFraud(gpsAlt: number | undefined, baroAlt: number | undefined, claimedLat: number, claimedLng: number): FraudSignal | null {
  if (!baroAlt || !gpsAlt) return null;

  const altDiff = Math.abs(gpsAlt - baroAlt);
  const altDiffMeters = altDiff * 1000;

  if (altDiffMeters > 30) {
    return {
      type: 'barometer_elevation_mismatch',
      severity: altDiffMeters > 50 ? 'critical' : 'high',
      evidence: {
        gps_altitude_meters: gpsAlt * 1000,
        barometer_altitude_meters: baroAlt * 1000,
        difference_meters: altDiffMeters,
        claimed_location: { lat: claimedLat, lng: claimedLng },
       推断: altDiffMeters > 50 ? 'GPS spoofing detected - altitude indicates 10th+ floor apartment' : 'Possible elevation spoofing'
      },
      confidence: Math.min(0.95, 0.5 + (altDiffMeters / 100)),
      verdict: altDiffMeters > 50 ? 'flag' : 'review'
    };
  }

  return null;
}

function analyzeThermalFraud(batteryTemp: number | undefined, brightness: number | undefined, isCharging: boolean, timeOfDay: number): FraudSignal | null {
  if (batteryTemp === undefined) return null;

  const isOutsideExpected = 
    (batteryTemp > 45 && !isCharging) ||
    (batteryTemp < 20 && timeOfDay > 8 && timeOfDay < 20);

  if (isOutsideExpected) {
    return {
      type: 'thermal_anomaly',
      severity: 'medium',
      evidence: {
        battery_temperature_celsius: batteryTemp,
        screen_brightness: brightness,
        is_charging: isCharging,
        time_of_day: timeOfDay,
        analysis: batteryTemp > 45 ? 'Phone running hot - likely active delivery in sun' : 'Phone cold - likely idle indoors'
      },
      confidence: 0.6,
      verdict: 'review'
    };
  }

  return null;
}

function analyzeGPSAccuracy(gpsAcc: number | undefined, speed: number | undefined): FraudSignal | null {
  if (!gpsAcc || gpsAcc === 0) return null;

  if (gpsAcc > 100) {
    return {
      type: 'gps_accuracy_poor',
      severity: 'low',
      evidence: {
        accuracy_meters: gpsAcc,
        analysis: 'GPS accuracy too poor for reliable location'
      },
      confidence: 0.4,
      verdict: 'review'
    };
  }

  if (speed !== undefined && speed > 200) {
    return {
      type: 'impossible_velocity',
      severity: 'critical',
      evidence: {
        claimed_speed_kmh: speed,
        analysis: 'Impossible travel speed detected'
      },
      confidence: 0.99,
      verdict: 'flag'
    };
  }

  return null;
}

function analyzePatternFraud(claimHistory: any[], deviceId: string): FraudSignal | null {
  if (claimHistory.length < 3) return null;

  const recentClaims = claimHistory.slice(-5);
  const sameLocation = recentClaims.every(c => 
    c.lat && recentClaims[0].lat && Math.abs(c.lat - recentClaims[0].lat) < 0.001
  );

  if (sameLocation && recentClaims.length >= 3) {
    return {
      type: 'location_stickiness',
      severity: 'medium',
      evidence: {
        claim_count_at_same_location: recentClaims.length,
        analysis: 'Multiple claims from identical location - possible abuse'
      },
      confidence: 0.7,
      verdict: 'review'
    };
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, claimId, telemetry, location, deviceId } = req.body || {};

    if (!partnerId || !telemetry) {
      return res.status(400).json({ error: 'Missing partnerId or telemetry' });
    }

    const deviceTelemetry: DeviceTelemetry = {
      barometer_altitude: telemetry.barometer_altitude,
      battery_temperature: telemetry.battery_temperature,
      battery_level: telemetry.battery_level,
      is_charging: telemetry.is_charging,
      gps_altitude: telemetry.gps_altitude,
      gps_accuracy: telemetry.gps_accuracy,
      screen_brightness: telemetry.screen_brightness
    };

    const signals: FraudSignal[] = [];
    const timeOfDay = new Date().getHours();

    const baroSignal = analyzeBarometerFraud(
      deviceTelemetry.gps_altitude,
      deviceTelemetry.barometer_altitude,
      location?.lat || 0,
      location?.lng || 0
    );
    if (baroSignal) signals.push(baroSignal);

    const thermalSignal = analyzeThermalFraud(
      deviceTelemetry.battery_temperature,
      deviceTelemetry.screen_brightness,
      deviceTelemetry.is_charging || false,
      timeOfDay
    );
    if (thermalSignal) signals.push(thermalSignal);

    const gpsSignal = analyzeGPSAccuracy(
      deviceTelemetry.gps_accuracy,
      location?.speed
    );
    if (gpsSignal) signals.push(gpsSignal);

    const { data: claims } = await supabaseServer
      .from('claims')
      .select('*')
      .eq('worker_id', partnerId)
      .order('processed_at', { ascending: false })
      .limit(10);

    const patternSignal = analyzePatternFraud(claims || [], deviceId || partnerId);
    if (patternSignal) signals.push(patternSignal);

    const flagged = signals.filter(s => s.verdict === 'flag');
    const review = signals.filter(s => s.verdict === 'review');
    const passed = signals.filter(s => s.verdict === 'pass');

    const overallConfidence = flagged.length > 0 ? 0.95 : 
      review.length > 0 ? 0.6 : 0.1;

    const fraudScore = 
      (flagged.length * 0.4) + 
      (review.length * 0.2) + 
      (passed.length * -0.1);

    const finalVerdict = flagged.length > 0 ? 'flagged' :
      review.length > 0 ? 'review' : 'passed';

    if (claimId) {
      await supabaseServer.from('claims').update({
        jep_data: {
          ...(claims?.[0]?.jep_data || {}),
          fraud_analysis: {
            signals,
            verdict: finalVerdict,
            fraud_score: Math.min(1, Math.max(0, fraudScore)),
            confidence: overallConfidence,
            analyzed_at: new Date().toISOString()
          }
        }
      }).eq('claim_id_str', claimId);
    }

    return res.json({
      success: true,
      verdict: finalVerdict,
      fraud_score: Math.min(1, Math.max(0, fraudScore)),
      confidence: overallConfidence,
      signals,
      summary: {
        flagged: flagged.length,
        review: review.length,
        passed: passed.length
      },
      checks: {
        barometer: !!deviceTelemetry.barometer_altitude,
        thermal: !!deviceTelemetry.battery_temperature,
        gps_accuracy: !!deviceTelemetry.gps_accuracy
      }
    });

  } catch (error: any) {
    console.error('[Sensor Fraud] Error:', error);
    return res.status(500).json({ error: error.message || 'Sensor fusion analysis failed' });
  }
}
