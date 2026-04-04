export interface OfflineClaim {
  id: string;
  timestamp: string;
  gps: { lat: number; lon: number };
  shiftStatus: string;
  description: string;
  evidenceBase64?: string;
}

export const saveOfflineClaim = (claim: OfflineClaim) => {
  const existing = getOfflineClaims();
  existing.push(claim);
  localStorage.setItem('nexus_offline_claims', JSON.stringify(existing));
};

export const getOfflineClaims = (): OfflineClaim[] => {
  try {
    const data = localStorage.getItem('nexus_offline_claims');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const clearOfflineClaims = () => {
  localStorage.removeItem('nexus_offline_claims');
};

export const syncOfflineClaims = async () => {
  const claims = getOfflineClaims();
  if (claims.length === 0) return;

  const results = [];
  for (const claim of claims) {
    try {
      const response = await fetch('/api/claims/time-shifted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id: claim.id,
          cached_gps: claim.gps,
          cached_shift_status: claim.shiftStatus,
          submitted_at: new Date().toISOString(),
          original_timestamp: claim.timestamp
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        results.push(data);
      }
    } catch (e) {
      console.error('Failed to sync claim', claim.id, e);
    }
  }

  // If all synced successfully, clear the queue
  if (results.length === claims.length) {
    clearOfflineClaims();
  }
  
  return results;
};
