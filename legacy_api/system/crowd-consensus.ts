import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { latLngToCell, cellToLatLng, gridDisk } from 'h3-js';

interface WorkerVelocity {
  worker_id: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  timestamp: string;
  h3_hex: string;
}

interface ConsensusTrigger {
  hex: string;
  center_lat: number;
  center_lng: number;
  worker_count: number;
  avg_speed_before: number;
  avg_speed_after: number;
  duration_minutes: number;
  is_civic_blockade: boolean;
  is_weather_related: boolean;
  confidence: number;
}

async function calculateWorkerVelocities(partnerIds: string[]): Promise<WorkerVelocity[]> {
  const { data: locations } = await supabaseServer
    .from('worker_locations')
    .select('*')
    .in('partner_id', partnerIds)
    .gte('timestamp', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: true });

  if (!locations || locations.length === 0) return [];

  const velocities: WorkerVelocity[] = [];
  const workerLocations = new Map<string, any[]>();

  locations.forEach(loc => {
    const existing = workerLocations.get(loc.partner_id) || [];
    existing.push(loc);
    workerLocations.set(loc.partner_id, existing);
  });

  workerLocations.forEach((locs, workerId) => {
    if (locs.length < 2) return;
    
    const recent = locs.slice(-6);
    let totalSpeed = 0;
    let count = 0;

    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];
      const timeDiff = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000 / 3600;
      
      if (timeDiff > 0 && timeDiff < 1) {
        const distanceKm = haversineDistance(
          prev.last_lat, prev.last_lng,
          curr.last_lat, curr.last_lng
        );
        const speedKmh = distanceKm / timeDiff;
        totalSpeed += speedKmh;
        count++;

        const h3Hex = latLngToCell(curr.last_lat, curr.last_lng, 7);
        
        velocities.push({
          worker_id: workerId,
          lat: curr.last_lat,
          lng: curr.last_lng,
          speed_kmh: speedKmh,
          timestamp: curr.timestamp,
          h3_hex: h3Hex
        });
      }
    }
  });

  return velocities;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function checkWeatherForHex(lat: number, lon: number): Promise<boolean> {
  try {
    const weatherApiKey = process.env.OPENWEATHER_API_KEY || process.env.VITE_OPENWEATHER_API_KEY;
    if (!weatherApiKey || weatherApiKey.includes('placeholder')) {
      return false;
    }

    const axios = (await import('axios')).default;
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}`
    );
    
    const weather = response.data?.weather?.[0]?.id || 0;
    return weather >= 500 && weather <= 531;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { action, hexes, threshold_workers } = req.body || {};
    const minWorkers = threshold_workers || 10;
    const targetHexes = hexes || [];

    if (action === 'pin-drop') {
      const { worker_id, hex, reason } = req.body || {};
      
      const { data: pin, error: pinError } = await supabaseServer
        .from('disruption_pins')
        .insert([{
          worker_id,
          h3_hex: hex,
          reason: reason || 'civic_disruption',
          status: 'active'
        }])
        .select()
        .single();

      if (pinError) throw pinError;

      const { count } = await supabaseServer
        .from('disruption_pins')
        .select('*', { count: 'exact', head: true })
        .eq('h3_hex', hex)
        .eq('status', 'active');

      const triggerThreshold = 5;
      const triggered = (count || 0) >= triggerThreshold;

      if (triggered) {
        const [centerLat, centerLng] = cellToLatLng(hex);
        
        await supabaseServer.from('disruption_triggers').insert([{
          zone_h3: hex,
          trigger_type: 'civic_disruption',
          severity: 'medium',
          fired_at: new Date().toISOString(),
          source: 'crowd_consensus_pin',
          details: { pin_count: count, reason }
        }]);
      }

      return res.json({
        success: true,
        pin_count: count,
        threshold: triggerThreshold,
        triggered,
        message: triggered ? 'Disruption confirmed by consensus' : 'Pin recorded'
      });
    }

    const { data: recentWorkers, error: workerError } = await supabaseServer
      .from('worker_locations')
      .select('partner_id, last_lat, last_lng, timestamp')
      .gte('timestamp', new Date(Date.now() - 30 * 60 * 1000).toISOString());

    if (workerError) throw workerError;
    if (!recentWorkers || recentWorkers.length === 0) {
      return res.json({ 
        success: true, 
        triggers: [],
        message: 'No worker telemetry available',
        hex_analysis: []
      });
    }

    const workerMap = new Map<string, any[]>();
    recentWorkers.forEach(w => {
      const existing = workerMap.get(w.partner_id) || [];
      existing.push(w);
      workerMap.set(w.partner_id, existing);
    });

    const velocities = await calculateWorkerVelocities(Array.from(workerMap.keys()));
    const hexSpeeds = new Map<string, { before: number[]; after: number[] }>();

    velocities.forEach(v => {
      const speeds = hexSpeeds.get(v.h3_hex) || { before: [], after: [] };
      const timeSinceNow = Date.now() - new Date(v.timestamp).getTime();
      
      if (timeSinceNow < 10 * 60 * 1000) {
        speeds.after.push(v.speed_kmh);
      } else {
        speeds.before.push(v.speed_kmh);
      }
      hexSpeeds.set(v.h3_hex, speeds);
    });

    const triggers: ConsensusTrigger[] = [];
    const hexAnalysis: any[] = [];

    hexSpeeds.forEach((speeds, hex) => {
      const avgSpeedBefore = speeds.before.length > 0 
        ? speeds.before.reduce((a, b) => a + b, 0) / speeds.before.length 
        : 30;
      const avgSpeedAfter = speeds.after.length > 0 
        ? speeds.after.reduce((a, b) => a + b, 0) / speeds.after.length 
        : 30;

      const workerCount = (speeds.before.length + speeds.after.length);
      const speedDrop = avgSpeedBefore - avgSpeedAfter;
      const isStalled = avgSpeedAfter < 2 && workerCount >= minWorkers;

      const [centerLat, centerLng] = cellToLatLng(hex);

      hexAnalysis.push({
        hex,
        center_lat: centerLat,
        center_lng: centerLng,
        worker_count: workerCount,
        avg_speed_before: Math.round(avgSpeedBefore * 10) / 10,
        avg_speed_after: Math.round(avgSpeedAfter * 10) / 10,
        speed_drop_kmh: Math.round(speedDrop * 10) / 10,
        is_stalled: isStalled
      });

      if (isStalled) {
        checkWeatherForHex(centerLat, centerLng).then(isWeatherRelated => {
          const trigger: ConsensusTrigger = {
            hex,
            center_lat: centerLat,
            center_lng: centerLng,
            worker_count: workerCount,
            avg_speed_before: avgSpeedBefore,
            avg_speed_after: avgSpeedAfter,
            duration_minutes: 20,
            is_civic_blockade: !isWeatherRelated,
            is_weather_related: isWeatherRelated,
            confidence: Math.min(1, workerCount / minWorkers)
          };

          triggers.push(trigger);

          if (!isWeatherRelated) {
            supabaseServer.from('disruption_triggers').insert([{
              zone_h3: hex,
              trigger_type: 'civic_disruption',
              severity: 'medium',
              fired_at: new Date().toISOString(),
              source: 'crowd_velocity',
              details: { worker_count: workerCount, speed_drop: speedDrop }
            }]).then();
          }
        });
      }
    });

    return res.json({
      success: true,
      triggers,
      hex_analysis: hexAnalysis,
      summary: {
        total_hexes_analyzed: hexSpeeds.size,
        triggers_detected: triggers.length,
        consensus_threshold: minWorkers
      }
    });

  } catch (error: any) {
    console.error('[Crowd Consensus] Error:', error);
    return res.status(500).json({ error: error.message || 'Consensus check failed' });
  }
}
