import React, { useEffect, useState } from 'react';
import { getBiometricStatus } from '../lib/biometricService';

export default function Preview() {
  const [status, setStatus] = useState<{ essential: boolean; full: boolean }>(() => ({ essential: false, full: false }));
  const [frameLat, setFrameLat] = useState<number>(0);

  useEffect(() => {
    // Poll biometric status
    const t = setInterval(() => {
      const s = getBiometricStatus();
      setStatus({ essential: s.essential, full: s.full });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Simple latency stub
  useEffect(() => {
    const t = setInterval(() => {
      // simulate minor latency drift for preview
      setFrameLat((p) => Math.max(0, (p + Math.random() * 5) % 60));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Preview: Biometric & Latency</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 800 }}>
        <div style={{ padding: 12, border: '1px solid #333', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Biometric Engine</div>
          <div>Essential: {status.essential ? 'Loaded' : 'Loading'}</div>
          <div>Full: {status.full ? 'Loaded' : 'Loading'}</div>
        </div>
        <div style={{ padding: 12, border: '1px solid #333', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Latency (demo)</div>
          <div>Avg frame latency (demo): ~{Math.round((frameLat % 60))} ms</div>
        </div>
      </div>
      <div style={{ marginTop: 20, color: '#888', fontSize: 12 }}>
        This preview shows real-time biometric readiness and a lightweight latency readout. It does not affect production routing.
      </div>
    </div>
  );
}
