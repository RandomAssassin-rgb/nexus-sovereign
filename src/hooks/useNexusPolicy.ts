import { useState, useEffect } from 'react';
import { getPolicyStatus } from '../lib/payoutStore';

export function useNexusPolicy() {
  const [policy, setPolicy] = useState(getPolicyStatus());

  useEffect(() => {
    const update = () => {
      // Logic for deterministic derivation
      const isUpgraded = localStorage.getItem("nexus_premium_upgraded") === "true";
      const start = localStorage.getItem("nexus_premium_start") || new Date().toISOString();
      const storedUntil = localStorage.getItem("nexus_premium_until");
      
      // Default duration is 7 days for the demo
      const DURATION_MS = 7 * 24 * 60 * 60 * 1000;
      
      let expiry: Date;
      if (storedUntil) {
        expiry = new Date(storedUntil);
      } else {
        expiry = new Date(new Date(start).getTime() + DURATION_MS);
      }

      const now = new Date();
      const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isActive = expiry > now || isUpgraded;

      setPolicy({
        isActive,
        validTill: expiry.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        daysLeft: Math.max(0, diffDays),
        isUpgraded
      });
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  return policy;
}
