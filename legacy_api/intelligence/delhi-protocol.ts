import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import axios from 'axios';

interface GRAPStatus {
  stage: number;
  label: string;
  aqi_threshold: number;
  restrictions: string[];
  triggered_at: string | null;
}

const GRAP_STAGES: Record<number, GRAPStatus> = {
  1: {
    stage: 1,
    label: 'Stage 1 - Good',
    aqi_threshold: 100,
    restrictions: ['No restrictions'],
    triggered_at: null
  },
  2: {
    stage: 2,
    label: 'Stage 2 - Satisfactory',
    aqi_threshold: 200,
    restrictions: ['No diesel 2-wheelers in Delhi'],
    triggered_at: null
  },
  3: {
    stage: 3,
    label: 'Stage 3 - Poor',
    aqi_threshold: 300,
    restrictions: ['Diesel 2-wheelers banned', 'Truck entry restricted'],
    triggered_at: null
  },
  4: {
    stage: 4,
    label: 'Stage 4 - Severe',
    aqi_threshold: 450,
    restrictions: ['All non-electric commercial vehicles banned', 'No construction', 'School closure'],
    triggered_at: null
  }
};

function determineGRAPStage(aqi: number): number {
  if (aqi <= 100) return 1;
  if (aqi <= 200) return 2;
  if (aqi <= 300) return 3;
  if (aqi <= 450) return 4;
  return 4;
}

async function fetchDelhiAQI(): Promise<number> {
  const aqiToken = process.env.AQI_TOKEN || process.env.VITE_AQI_TOKEN;
  
  if (!aqiToken || aqiToken.includes('placeholder')) {
    console.warn('[Delhi Protocol] No AQI token - returning safe default');
    return 150;
  }

  try {
    const response = await axios.get(
      `https://api.waqi.info/feed/delhi/`,
      { params: { token: aqiToken } }
    );
    return response.data?.data?.aqi || 200;
  } catch {
    return 200;
  }
}

async function checkGRAPLockouts(): Promise<any[]> {
  const currentAqi = await fetchDelhiAQI();
  const stage = determineGRAPStage(currentAqi);
  const grapStatus = GRAP_STAGES[stage];
  
  grapStatus.triggered_at = new Date().toISOString();

  const lockouts: any[] = [];

  if (stage >= 4) {
    const { data: petrolWorkers } = await supabaseServer
      .from('users')
      .select('partnerId, full_name, phone, platform, last_known_lat, last_known_lng')
      .eq('vehicle_type', 'petrol')
      .eq('platform', 'zepto')
      .or('platform.swiggy,platform.zomato');

    if (petrolWorkers) {
      for (const worker of petrolWorkers) {
        lockouts.push({
          worker_id: worker.partnerId,
          reason: 'GRAP Stage 4 - Non-electric commercial vehicles banned',
          status: 'involuntary',
          aqi_at_trigger: currentAqi,
          grap_stage: 4,
          triggered_at: new Date().toISOString(),
          earnings_protected: true,
          payout_type: 'lockout_compensation'
        });
      }
    }
  }

  if (stage >= 3) {
    await supabaseServer.from('disruption_triggers').insert([{
      zone_h3: 'delhi_capital',
      trigger_type: 'grap_restriction',
      severity: stage === 4 ? 'critical' : 'high',
      fired_at: new Date().toISOString(),
      source: 'grap_monitoring',
      details: {
        stage,
        aqi: currentAqi,
        restrictions: grapStatus.restrictions,
        lockouts_triggered: lockouts.length
      }
    }]);
  }

  return lockouts;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { action, city, manual_aqi } = req.body || {};

    if (action === 'status') {
      const aqi = manual_aqi || await fetchDelhiAQI();
      const stage = determineGRAPStage(aqi);
      
      return res.json({
        success: true,
        grap: GRAP_STAGES[stage],
        current_aqi: aqi,
        city: city || 'Delhi',
        checked_at: new Date().toISOString(),
        protocol: 'Delhi GRAP (Graded Response Action Plan)',
        explanation: stage >= 4 
          ? 'Severe pollution - All non-electric commercial vehicles banned by government order. Workers with petrol bikes cannot work.'
          : stage >= 3
          ? 'Poor air quality - Diesel 2-wheelers restricted. Electric vehicles only.'
          : 'Air quality acceptable for delivery work.'
      });
    }

    if (action === 'trigger-lockouts' || action === 'check') {
      const lockouts = await checkGRAPLockouts();
      const aqi = await fetchDelhiAQI();
      const stage = determineGRAPStage(aqi);

      return res.json({
        success: true,
        action: action,
        grap_stage: stage,
        current_aqi: aqi,
        lockouts_processed: lockouts.length,
        lockouts: lockouts.slice(0, 10),
        message: lockouts.length > 0 
          ? `${lockouts.length} workers affected by GRAP Stage ${stage}`
          : 'No lockouts triggered - AQI below threshold',
        timestamp: new Date().toISOString()
      });
    }

    if (req.method === 'GET') {
      const aqi = await fetchDelhiAQI();
      const stage = determineGRAPStage(aqi);
      
      return res.json({
        success: true,
        grap: GRAP_STAGES[stage],
        current_aqi: aqi,
        city: 'Delhi',
        checked_at: new Date().toISOString()
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use status, trigger-lockouts, or check.' });

  } catch (error: any) {
    console.error('[Delhi Protocol] Error:', error);
    return res.status(500).json({ error: error.message || 'GRAP check failed' });
  }
}
