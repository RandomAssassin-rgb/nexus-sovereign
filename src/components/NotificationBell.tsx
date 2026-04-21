import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { getUnreadCount } from "../lib/payoutStore";
import { cn } from "../lib/utils";

export default function NotificationBell() {
  const [payoutUnreadCount, setPayoutUnreadCount] = useState(getUnreadCount());
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);

  useEffect(() => {
    const refresh = () => setPayoutUnreadCount(getUnreadCount());
    const handleInboxUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      if (typeof detail?.count === "number") {
        setInboxUnreadCount(detail.count);
      }
    };
    const handleSeen = (event: Event) => {
      const detail = (event as CustomEvent<{ ids?: string[] }>).detail;
      const seenCount = detail?.ids?.length || 0;
      if (seenCount > 0) {
        setInboxUnreadCount((current) => Math.max(0, current - seenCount));
      }
    };
    window.addEventListener("nexus-payout-update", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("nexus-inbox-update", handleInboxUpdate as EventListener);
    window.addEventListener("nexus-notification-seen", handleSeen as EventListener);
    return () => {
      window.removeEventListener("nexus-payout-update", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("nexus-inbox-update", handleInboxUpdate as EventListener);
      window.removeEventListener("nexus-notification-seen", handleSeen as EventListener);
    };
  }, []);

  const unreadCount = Math.max(payoutUnreadCount, inboxUnreadCount);

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("nexus-toggle-notifications", { detail: { open: true } }));
  };

  return (
    <button 
      onClick={handleClick}
      className="p-2.5 bg-secondary/50 hover:bg-secondary rounded-xl transition-all relative group active:scale-95"
    >
      <Bell size={20} className="group-hover:rotate-[15deg] transition-transform" />
      {unreadCount > 0 && (
        <span className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-background animate-pulse shrink-0" />
      )}
    </button>
  );
}
