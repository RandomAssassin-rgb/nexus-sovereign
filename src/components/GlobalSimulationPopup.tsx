import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ArrowRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PENDING_NOTIF_PAYLOAD = "nexus_pending_payout_notif";
const ZERO_TOUCH_POPUP_LAST_SHOWN_AT = "nexus_zero_touch_popup_last_shown_at";
const ZERO_TOUCH_POPUP_COOLDOWN_MS = 2 * 60 * 1000;

export default function GlobalSimulationPopup() {
  const navigate = useNavigate();
  const [showAutoTrigger, setShowAutoTrigger] = useState(false);
  const [currentPayout, setCurrentPayout] = useState<any>(null);
  const showAutoTriggerRef = useRef(false);
  const pendingDisplayTimeoutRef = useRef<number | null>(null);

  const playAlert = () => {
    try {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      audio.volume = 0.5;
      audio.play().catch((error) => console.warn("Audio play failed (user interaction required):", error));
    } catch (error) {
      console.warn("Audio alert failed", error);
    }
  };

  const clearPendingDisplayTimeout = () => {
    if (pendingDisplayTimeoutRef.current !== null) {
      window.clearTimeout(pendingDisplayTimeoutRef.current);
      pendingDisplayTimeoutRef.current = null;
    }
  };

  const getLastShownAt = () => Number(localStorage.getItem(ZERO_TOUCH_POPUP_LAST_SHOWN_AT) || "0");

  const getRemainingCooldown = () => {
    const elapsed = Date.now() - getLastShownAt();
    return Math.max(0, ZERO_TOUCH_POPUP_COOLDOWN_MS - elapsed);
  };

  const readPendingPayout = () => {
    const pending = localStorage.getItem(PENDING_NOTIF_PAYLOAD);
    if (!pending) return null;

    try {
      return JSON.parse(pending);
    } catch (error) {
      console.error("Failed to parse persistent payout", error);
      localStorage.removeItem(PENDING_NOTIF_PAYLOAD);
      return null;
    }
  };

  const openPopup = (payout: any, shouldPlaySound: boolean) => {
    setCurrentPayout(payout);
    setShowAutoTrigger(true);
    localStorage.setItem(ZERO_TOUCH_POPUP_LAST_SHOWN_AT, String(Date.now()));
    localStorage.removeItem(PENDING_NOTIF_PAYLOAD);

    if (shouldPlaySound) {
      playAlert();
    }
  };

  const schedulePendingDisplay = () => {
    clearPendingDisplayTimeout();

    const pending = readPendingPayout();
    if (!pending) return;

    const waitMs = Math.max(getRemainingCooldown(), showAutoTriggerRef.current ? 1000 : 0);
    pendingDisplayTimeoutRef.current = window.setTimeout(() => {
      pendingDisplayTimeoutRef.current = null;

      const latestPending = readPendingPayout();
      if (!latestPending) return;

      if (showAutoTriggerRef.current || getRemainingCooldown() > 0) {
        schedulePendingDisplay();
        return;
      }

      console.log("%c[GLOBAL] Displaying throttled zero-touch payout", "color: #10b981; font-weight: bold;");
      openPopup(latestPending, false);
    }, waitMs);
  };

  const queueOrDisplayPayout = (payout: any, shouldPlaySound: boolean) => {
    if (!payout) return;

    localStorage.setItem(PENDING_NOTIF_PAYLOAD, JSON.stringify(payout));

    if (showAutoTriggerRef.current || getRemainingCooldown() > 0) {
      console.log("%c[GLOBAL] Zero-touch popup cooldown active", "color: #f59e0b; font-weight: bold;");
      schedulePendingDisplay();
      return;
    }

    openPopup(payout, shouldPlaySound);
  };

  useEffect(() => {
    showAutoTriggerRef.current = showAutoTrigger;
    if (!showAutoTrigger) {
      schedulePendingDisplay();
    }
  }, [showAutoTrigger]);

  useEffect(() => {
    const handleZeroTouch = (event: Event) => {
      const payout = (event as CustomEvent).detail;
      console.log("%c[GLOBAL] Zero-Touch Payout Received", "background: #10b981; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;");
      queueOrDisplayPayout(payout, true);
    };

    const checkPersistentNotifications = () => {
      const payout = readPendingPayout();
      if (!payout) return;

      console.log("%c[GLOBAL] Recovering Persistent Payout", "color: #10b981; font-weight: bold;");
      queueOrDisplayPayout(payout, false);
    };

    window.addEventListener("nexus-zero-touch-payout", handleZeroTouch as EventListener);
    window.addEventListener("focus", checkPersistentNotifications);
    checkPersistentNotifications();

    return () => {
      window.removeEventListener("nexus-zero-touch-payout", handleZeroTouch as EventListener);
      window.removeEventListener("focus", checkPersistentNotifications);
      clearPendingDisplayTimeout();
    };
  }, []);

  return (
    <AnimatePresence>
      {showAutoTrigger && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm pointer-events-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-card border border-primary/50 rounded-3xl p-6 shadow-2xl max-w-sm w-full relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-emerald-500 to-primary animate-pulse" />

            <button
              onClick={() => setShowAutoTrigger(false)}
              className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>

            <div className="flex flex-col items-center text-center space-y-4 pt-2">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border-2 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                <Zap className="w-8 h-8 text-emerald-500" />
              </div>

              <div>
                <h2 className="text-xl font-bold tracking-tight">Zero-Touch Trigger</h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {currentPayout?.reason || "Severe disruption"} detected in your zone. Your payout has been processed instantly.
                </p>
              </div>

              <div className="w-full bg-secondary/50 rounded-2xl p-4 border border-border/50 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Payout Amount</span>
                  <span className="font-bold text-emerald-500 text-base">Rs {currentPayout?.amount?.toLocaleString() || "---"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Ref ID</span>
                  <span className="font-mono text-[10px] text-muted-foreground bg-secondary px-2 py-1 rounded">
                    {currentPayout?.id || currentPayout?.claim?.id || "NX-SIM-482"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowAutoTrigger(false);
                  navigate(`/payout-success/${currentPayout?.id || currentPayout?.claim?.id || "auto"}`);
                }}
                className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20"
              >
                View Claim Status <ArrowRight size={18} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
