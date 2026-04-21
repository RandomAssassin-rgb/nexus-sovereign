export type NexusNotificationKind = "payout" | "trigger" | "review" | "system" | "wallet";
export type NexusNotificationSeverity = "info" | "warning" | "critical" | "success";

export interface NexusNotificationPayload {
  id: string;
  title: string;
  body: string;
  kind: NexusNotificationKind;
  severity: NexusNotificationSeverity;
  createdAt: string;
  route?: string;
  metadata?: Record<string, unknown>;
}

export interface NexusInboxResponse {
  success: boolean;
  unreadCount: number;
  items: NexusNotificationPayload[];
  forecastHeadline?: string;
}

const SEEN_NOTIFICATION_KEY = "nexus_seen_notifications_v1";

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readSeenNotificationIds() {
  if (!canUseBrowserStorage()) return new Set<string>();

  try {
    const raw = localStorage.getItem(SEEN_NOTIFICATION_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

function writeSeenNotificationIds(ids: Set<string>) {
  if (!canUseBrowserStorage()) return;
  localStorage.setItem(SEEN_NOTIFICATION_KEY, JSON.stringify(Array.from(ids)));
}

export function getUnseenNotifications(items: NexusNotificationPayload[]) {
  const seen = readSeenNotificationIds();
  return items.filter((item) => !seen.has(item.id));
}

export function markNotificationsSeen(ids: string[]) {
  if (ids.length === 0) return;
  const seen = readSeenNotificationIds();
  ids.forEach((id) => seen.add(id));
  writeSeenNotificationIds(seen);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("nexus-notification-seen", {
        detail: { ids },
      })
    );
  }
}

async function sendNotificationToServiceWorker(payload: NexusNotificationPayload) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const activeWorker =
      registration.active ||
      navigator.serviceWorker.controller ||
      registration.waiting ||
      registration.installing;

    if (!activeWorker) return false;

    activeWorker.postMessage({
      type: "NEXUS_NOTIFY",
      payload,
    });

    return true;
  } catch {
    return false;
  }
}

async function sendNotificationWithBrowserApi(payload: NexusNotificationPayload) {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return false;
  }

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;

  if (permission !== "granted") return false;

  const notification = new Notification(payload.title, {
    body: payload.body,
    tag: payload.id,
  });

  notification.onclick = () => {
    window.focus();
    if (payload.route) {
      window.location.assign(payload.route);
    }
    notification.close();
  };

  return true;
}

export async function deliverLocalNotification(payload: NexusNotificationPayload) {
  const viaServiceWorker = await sendNotificationToServiceWorker(payload);
  if (viaServiceWorker) return true;
  return sendNotificationWithBrowserApi(payload);
}

export async function deliverUnseenNotifications(
  items: NexusNotificationPayload[],
  options?: { limit?: number }
) {
  const unseen = getUnseenNotifications(items).slice(0, options?.limit ?? items.length);
  const deliveredIds: string[] = [];

  for (const item of unseen) {
    const delivered = await deliverLocalNotification(item);
    if (delivered) deliveredIds.push(item.id);
  }

  if (deliveredIds.length > 0) {
    markNotificationsSeen(deliveredIds);
  }

  return deliveredIds;
}
