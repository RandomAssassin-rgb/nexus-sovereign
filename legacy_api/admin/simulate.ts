import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { ensureSkeletonUser } from '../_lib/supabaseHelper';
import {
  buildSimulationAck,
  buildSimulationBroadcastPayload,
  countSimulationRecipients,
  executeSimulationPersistence,
  getCachedSimulationUsers,
  getSimulationUserCacheSnapshot,
} from '../../src/lib/adminSimulation';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { type, message } = req.body || {};
    if (!type) return res.status(400).json({ error: "Disruption type required" });

    const cacheSnapshot = getSimulationUserCacheSnapshot();
    let cachedUsers = cacheSnapshot.users;

    if (cachedUsers.length === 0) {
      cachedUsers = await getCachedSimulationUsers(supabaseServer, 5 * 60_000);
    } else if (Date.now() - cacheSnapshot.fetchedAt > 30 * 60_000 && !cacheSnapshot.hasPendingRefresh) {
      void getCachedSimulationUsers(supabaseServer, 0).catch((error: any) => {
        console.warn("[Admin Simulation] Background audience cache refresh failed:", error?.message || error);
      });
    }

    const ack = buildSimulationAck(cachedUsers, type, message);
    const approximateCount = countSimulationRecipients(cachedUsers);

    const twinId = `TWIN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const twin = {
      id: twinId,
      timestamp: new Date().toISOString(),
      type: type,
      status: "active",
      geo_footprint: {
        lat: 12.9716,
        lng: 77.5946,
        radius_km: 12
      },
      metrics: {
        workers_exposed: approximateCount,
        projected_load: 0 
      }
    };
    const broadcastPayload = buildSimulationBroadcastPayload({
      type,
      message,
      ack,
      simulationId: twinId,
      twin,
      popupDelayMs: 3500,
    });

    void supabaseServer
      .channel('disruptions')
      .send({
        type: 'broadcast',
        event: 'MASS_ANOMALY',
        payload: broadcastPayload,
      })
      .then((status) => {
        if (status !== 'ok') {
          console.error(`[Admin] Broadcast failed with status: ${status}`);
        }
      })
      .catch((error: any) => {
        console.error('[Admin] Broadcast failed:', error?.message || error);
      });

    console.log(`[Admin Simulation] Fast acknowledgement queued for ${approximateCount} worker(s).`);

    res.json({
      success: true,
      queued: true,
      latency_mode: 'instant-ack',
      simulation_id: twinId,
      popup_display_at: broadcastPayload.popup_display_at,
      average_payout: ack.averagePayout,
      projected_total_payout: ack.projectedTotalPayout,
      message: message || `${type} payout simulation broadcast initiated across the protection network.`,
      count: approximateCount,
      affected_users: approximateCount,
    });

    // --- BACKGROUND HEAVY LIFTING (FIRE AND FORGET) ---
    setTimeout(() => {
      void (async () => {
        try {
          const users = cachedUsers;
          if (!users || users.length === 0) {
            console.log('[Admin Simulation] No users available for payout persistence.');
            return;
          }

          console.log(`[Admin Simulation] Background payout fanout started for ${ack.impactedUsers.length} worker(s).`);

          await executeSimulationPersistence({
            users: ack.impactedUsers,
            type,
            message,
            supabaseServer,
            ensureSkeletonUser,
            logPrefix: '[Admin Simulation]',
            twin,
            broadcastPayload,
          });
        } catch (error: any) {
          console.error('[Admin Simulation] Background payout fanout failed:', error?.message || error);
        }
      })();
    }, 1200); // Give global signal pulse a head start
  } catch (error: any) {
    console.error("[Admin Simulation] Critical Failure:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}
