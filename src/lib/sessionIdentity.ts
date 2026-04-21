function normalizeWorkerId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
  return trimmed;
}

function readPartnerIdFromSession(raw: string | null): string | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return normalizeWorkerId(
      parsed?.user?.partnerId ??
        parsed?.user?.partner_id ??
        parsed?.user?.id ??
        parsed?.partnerId ??
        parsed?.partner_id ??
        parsed?.id
    );
  } catch {
    return null;
  }
}

export function getWorkerPartnerIdSnapshot(): string | null {
  if (typeof window === "undefined") return null;

  return (
    normalizeWorkerId(localStorage.getItem("partner_id")) ||
    normalizeWorkerId(localStorage.getItem("nexus_partner_id")) ||
    normalizeWorkerId(localStorage.getItem("signin_phone")) ||
    readPartnerIdFromSession(localStorage.getItem("nexus_session")) ||
    readPartnerIdFromSession(localStorage.getItem("dummy_session"))
  );
}
