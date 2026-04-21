import { useState, useEffect } from "react";
import { apiClient } from "../lib/apiClient";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, Zap, Shield, Wallet, CheckCircle2, Info } from "lucide-react";
import { getNotifications, markNotificationsAsRead, type NexusNotification } from "../lib/payoutStore";
import { markNotificationsSeen, type NexusInboxResponse, type NexusNotificationPayload } from "../lib/notifications";
import { cn } from "../lib/utils";
import { getWorkerPartnerIdSnapshot } from "../lib/sessionIdentity";

export default function NotificationDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NexusNotification[]>(getNotifications());
  const [inboxItems, setInboxItems] = useState<NexusNotificationPayload[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const partnerId = getWorkerPartnerIdSnapshot();

  useEffect(() => {
    const handleToggle = (e: any) => {
      setIsOpen(e.detail?.open ?? !isOpen);
      setNotifications(getNotifications());
    };
    
    const refresh = () => setNotifications(getNotifications());

    window.addEventListener("nexus-toggle-notifications", handleToggle);
    window.addEventListener("nexus-payout-update", refresh);
    
    return () => {
      window.removeEventListener("nexus-toggle-notifications", handleToggle);
      window.removeEventListener("nexus-payout-update", refresh);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !partnerId) return;

    let isMounted = true;

    const loadInbox = async () => {
      setLoadingInbox(true);
      try {
        const response = await apiClient.get<NexusInboxResponse>(`/api/user/inbox?partnerId=${partnerId}`);
        if (isMounted) {
          setInboxItems(response.data?.items || []);
        }
      } catch (error) {
        console.warn("Inbox feed unavailable in notification drawer", error);
      } finally {
        if (isMounted) setLoadingInbox(false);
      }
    };

    void loadInbox();

    return () => {
      isMounted = false;
    };
  }, [isOpen, partnerId]);

  const handleMarkRead = () => {
    markNotificationsAsRead();
    setNotifications(getNotifications());
    markNotificationsSeen(inboxItems.map((item) => item.id));
  };

  const combinedNotifications = [
    ...inboxItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.body,
      time: new Date(item.createdAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      sortTime: new Date(item.createdAt).getTime(),
      isRead: false,
      type:
        item.kind === "payout"
          ? "payout"
          : item.kind === "wallet"
            ? "wallet"
            : item.kind === "trigger"
              ? "system"
              : "threat",
      route: item.route,
      remote: true,
    })),
    ...notifications.map((notification) => ({
      ...notification,
      route: undefined,
      remote: false,
      sortTime: Date.now(),
    })),
  ].sort((left, right) => right.sortTime - left.sortTime);

  const handleNotificationClick = (notification: (NexusNotification & { route?: string; remote?: boolean }) | any) => {
    if (notification.remote) {
      markNotificationsSeen([notification.id]);
      setInboxItems((current) => current.filter((item) => item.id !== notification.id));
    }

    if (notification.route) {
      window.location.assign(notification.route);
      setIsOpen(false);
    }
  };

  const getIcon = (type: NexusNotification["type"]) => {
    switch (type) {
      case "payout": return <Zap size={16} className="text-emerald-500" />;
      case "system": return <Shield size={16} className="text-blue-500" />;
      case "wallet": return <Wallet size={16} className="text-amber-500" />;
      case "threat": return <Info size={16} className="text-red-500" />;
      default: return <Bell size={16} />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[85%] max-w-md bg-card border-l border-border/10 shadow-2xl z-[101] flex flex-col"
          >
            <div className="p-6 border-b border-border/10 flex items-center justify-between bg-background/50">
              <div className="flex items-center gap-3">
                <Bell className="text-primary" size={20} />
                <h2 className="text-xl font-bold tracking-tight">Alert Center</h2>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-secondary rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingInbox ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mb-4">
                    <Bell size={24} className="text-muted-foreground opacity-50 animate-pulse" />
                  </div>
                  <h3 className="font-bold text-lg">Loading alerts</h3>
                  <p className="text-sm text-muted-foreground mt-1">Syncing the protection inbox and payout rail.</p>
                </div>
              ) : combinedNotifications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mb-4">
                    <Bell size={24} className="text-muted-foreground opacity-50" />
                  </div>
                  <h3 className="font-bold text-lg">No Notifications</h3>
                  <p className="text-sm text-muted-foreground mt-1">We'll alert you when payouts or threats are detected.</p>
                </div>
              ) : (
                combinedNotifications.map((n) => (
                  <motion.div
                    key={n.id}
                    layoutId={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      "p-4 rounded-2xl border transition-all cursor-pointer",
                      n.isRead ? "bg-secondary/20 border-border/30 opacity-70" : "bg-secondary/40 border-primary/20 shadow-sm"
                    )}
                  >
                    <div className="flex gap-3">
                      <div className="mt-1 shrink-0">{getIcon(n.type)}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-bold text-sm leading-tight">{n.title}</h4>
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{n.time}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{n.description}</p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {(notifications.some(n => !n.isRead) || inboxItems.length > 0) && (
              <div className="p-4 border-t border-border/10 bg-background/50">
                <button 
                  onClick={handleMarkRead}
                  className="w-full py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <CheckCircle2 size={16} /> Mark all as read
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
