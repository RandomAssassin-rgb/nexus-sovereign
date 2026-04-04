import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { getUnreadCount } from "../lib/payoutStore";
import { cn } from "../lib/utils";

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(getUnreadCount());

  useEffect(() => {
    const refresh = () => setUnreadCount(getUnreadCount());
    window.addEventListener("nexus-payout-update", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("nexus-payout-update", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

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
