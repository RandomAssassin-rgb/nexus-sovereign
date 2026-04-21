import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/apiClient";
import {
  Bell,
  ChevronRight,
  CheckCircle2,
  Shield,
  Smartphone,
  Wallet,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import NotificationBell from "../components/NotificationBell";
import { getDeviceStateSnapshot, registerForPushNotifications } from "../lib/deviceCapabilities";
import {
  markNotificationsSeen,
  type NexusInboxResponse,
  type NexusNotificationPayload,
} from "../lib/notifications";
import { getWorkerPartnerIdSnapshot } from "../lib/sessionIdentity";

function getItemTone(item: NexusNotificationPayload) {
  if (item.kind === "payout") return "bg-emerald-500/10 text-emerald-500";
  if (item.kind === "wallet") return "bg-blue-500/10 text-blue-500";
  if (item.kind === "trigger") return "bg-primary/10 text-primary";
  return "bg-amber-500/10 text-amber-500";
}

function getItemIcon(item: NexusNotificationPayload) {
  if (item.kind === "payout") return CheckCircle2;
  if (item.kind === "wallet") return Wallet;
  if (item.kind === "trigger") return Zap;
  return Shield;
}

export default function Inbox() {
  const navigate = useNavigate();
  const [inbox, setInbox] = useState<NexusInboxResponse | null>(null);
  const [deviceTrust, setDeviceTrust] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [registeringPush, setRegisteringPush] = useState(false);

  const partnerId = getWorkerPartnerIdSnapshot();

  useEffect(() => {
    if (!partnerId) return;

    let isMounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const snapshot = await getDeviceStateSnapshot();
        const [inboxRes, trustRes] = await Promise.all([
          apiClient.get<NexusInboxResponse>(`/api/user/inbox?partnerId=${partnerId}`),
          apiClient.post("/api/user/device-state", snapshot),
        ]);

        if (!isMounted) return;
        setInbox(inboxRes.data || null);
        setDeviceTrust(trustRes.data?.trust || null);
        window.dispatchEvent(
          new CustomEvent("nexus-inbox-update", {
            detail: { count: inboxRes.data?.unreadCount || inboxRes.data?.items?.length || 0 },
          })
        );
      } catch (error) {
        console.warn("Protection inbox load failed", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [partnerId]);

  const groupedItems = useMemo(() => {
    const items = inbox?.items || [];
    return {
      payouts: items.filter((item) => item.kind === "payout"),
      triggers: items.filter((item) => item.kind === "trigger"),
      review: items.filter((item) => item.kind === "review"),
      wallet: items.filter((item) => item.kind === "wallet"),
    };
  }, [inbox]);

  const handleOpenItem = (item: NexusNotificationPayload) => {
    markNotificationsSeen([item.id]);
    setInbox((current) =>
      current
        ? {
            ...current,
            unreadCount: Math.max(0, current.unreadCount - 1),
            items: current.items.filter((entry) => entry.id !== item.id),
          }
        : current
    );

    if (item.route) {
      navigate(item.route);
    }
  };

  const handleEnableAlerts = async () => {
    if (!partnerId) return;

    setRegisteringPush(true);
    try {
      const registration = await registerForPushNotifications();
      const payload = {
        partnerId,
        token: registration.token,
        platform: window.__NEXUS_API_RUNTIME__?.platform || "web",
        pushReady: registration.registered,
      };
      await apiClient.post("/api/user/notifications/register", payload);

      const snapshot = await getDeviceStateSnapshot();
      const trustRes = await apiClient.post("/api/user/device-state", snapshot);
      setDeviceTrust(trustRes.data?.trust || null);
    } catch (error) {
      console.error("Could not enable payout alerts", error);
    } finally {
      setRegisteringPush(false);
    }
  };

  const summaryCards = [
    {
      label: "Live alerts",
      value: inbox?.unreadCount || 0,
      meta: "Events requiring attention across payouts, reviews, and wallet movement.",
    },
    {
      label: "Payout notices",
      value: groupedItems.payouts.length,
      meta: "Approved release and settlement alerts from the protection rail.",
    },
    {
      label: "Trigger watch",
      value: groupedItems.triggers.length,
      meta: "Forecast and disruption intelligence now shaping protection posture.",
    },
  ];

  return (
    <div className="min-h-full flex flex-col">
      <header className="nexus-page-header">
        <div>
          <div className="nexus-section-eyebrow mb-2">Protection inbox</div>
          <h1 className="nexus-page-title">One feed for payouts, reviews, and live trigger posture.</h1>
        </div>
        <NotificationBell />
      </header>

      <main className="nexus-app-main space-y-6 pb-8">
        <section className="nexus-section-stack">
          <div className="nexus-section-heading">
            <div>
              <h2 className="nexus-section-title">Cross-platform alerts and policy continuity in one place.</h2>
            </div>
            <p className="nexus-section-copy">
              Track forecast shifts, claim outcomes, wallet activity, and device trust without hunting across screens.
            </p>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          {summaryCards.map((card) => (
            <div key={card.label} className="nexus-kpi-card">
              <div className="nexus-kpi-label">{card.label}</div>
              <div className="nexus-kpi-value">{loading ? "--" : card.value}</div>
              <p className="nexus-kpi-meta">{card.meta}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="nexus-panel p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="nexus-section-eyebrow mb-2">Live feed</div>
                <h3 className="text-2xl font-bold tracking-[-0.04em]">Protection notifications sorted by what matters now.</h3>
              </div>
              <div className="nexus-chip">
                <Bell size={14} />
                {inbox?.unreadCount || 0} live
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="nexus-subpanel rounded-2xl p-4">
                  <p className="text-sm text-muted-foreground">Syncing the worker inbox and live device posture...</p>
                </div>
              ) : inbox?.items?.length ? (
                inbox.items.map((item) => {
                  const Icon = getItemIcon(item);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleOpenItem(item)}
                      className="nexus-subpanel flex w-full items-start justify-between gap-4 rounded-2xl p-4 text-left transition-colors hover:border-primary/30"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`rounded-2xl p-3 ${getItemTone(item)}`}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{item.title}</div>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="mt-1 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })
              ) : (
                <div className="nexus-subpanel rounded-2xl p-4">
                  <p className="text-sm text-muted-foreground">
                    The protection inbox is empty right now. Fresh claims, payouts, and trigger changes will appear here automatically.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="nexus-panel p-5 md:p-6">
              <div className="nexus-section-eyebrow mb-2">Forecast pulse</div>
              <h3 className="text-2xl font-bold tracking-[-0.04em]">Digital twin headline</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {inbox?.forecastHeadline || "Forecast posture will appear after the next protection sync."}
              </p>
            </div>

            <div className="nexus-panel p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="nexus-section-eyebrow mb-2">Device posture</div>
                  <h3 className="text-2xl font-bold tracking-[-0.04em]">Keep alerts and autonomous readiness active.</h3>
                </div>
                <div className="nexus-chip">
                  <Smartphone size={14} />
                  {deviceTrust?.tier || "pending"}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="nexus-subpanel rounded-2xl p-4">
                  <div className="nexus-kpi-label">Trust score</div>
                  <div className="mt-2 text-2xl font-black tracking-[-0.05em]">
                    {deviceTrust ? `${Math.round(Number(deviceTrust.trust_score || 0) * 100)}%` : "Pending"}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cross-platform confidence derived from biometrics, storage, push, and location posture.
                  </p>
                </div>
                <div className="nexus-subpanel rounded-2xl p-4">
                  <div className="nexus-kpi-label">Action prompt</div>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {deviceTrust?.actions?.[0] || "Payout alerts and secure device trust are already aligned."}
                  </p>
                </div>
              </div>

              <button onClick={handleEnableAlerts} disabled={registeringPush} className="nexus-button-secondary mt-5 w-full">
                {registeringPush ? "Registering alerts..." : "Enable payout alerts"} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
