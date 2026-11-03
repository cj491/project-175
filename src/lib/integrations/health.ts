import type { ISODate } from "../types";

/**
 * Health data integration layer.
 *
 * Apple Health (HealthKit) and Google Health Connect are only reachable from a
 * native app. PROJECT 175 ships a Capacitor wrapper (see capacitor.config.ts);
 * inside it, `getHealthProvider()` returns a working provider backed by the
 * capacitor-health plugin. In a normal browser every provider reports
 * "unavailable" — nothing pretends to be connected.
 */
export type HealthProviderId = "apple_health" | "health_connect";
export type HealthStatus = "unavailable" | "disconnected" | "connected";

export interface HealthDaySummary {
  date: ISODate;
  steps: number;
}

export interface HealthProvider {
  id: HealthProviderId;
  label: string;
  status(): Promise<HealthStatus>;
  requestPermission(): Promise<boolean>;
  fetchDays(from: ISODate, to: ISODate): Promise<HealthDaySummary[]>;
}

export const PROVIDER_LABELS: Record<HealthProviderId, string> = {
  apple_health: "Apple Health",
  health_connect: "Google Fit / Health Connect",
};

const CONNECTED_KEY = "p175.health.connected";

function unavailable(id: HealthProviderId): HealthProvider {
  return { id, label: PROVIDER_LABELS[id], status: async () => "unavailable", requestPermission: async () => false, fetchDays: async () => [] };
}

/** Browser placeholders, shown on the Activity screen outside the native app. */
export const HEALTH_PROVIDERS: HealthProvider[] = [unavailable("apple_health"), unavailable("health_connect")];

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Returns the native provider when running inside the Capacitor app, otherwise null. */
export async function getHealthProvider(): Promise<HealthProvider | null> {
  if (typeof window === "undefined") return null;
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  const id: HealthProviderId = platform === "ios" ? "apple_health" : "health_connect";
  const { Health } = await import("capacitor-health");

  return {
    id,
    label: PROVIDER_LABELS[id],
    async status() {
      const { available } = await Health.isHealthAvailable().catch(() => ({ available: false }));
      if (!available) return "unavailable";
      return localStorage.getItem(CONNECTED_KEY) === id ? "connected" : "disconnected";
    },
    async requestPermission() {
      const res = await Health.requestHealthPermissions({ permissions: ["READ_STEPS"] });
      // iOS never reveals whether read access was granted; we treat the prompt as connected
      // and simply get zero steps if the user declined.
      const granted = platform === "ios" || res.permissions.some((p) => Object.values(p).some(Boolean));
      if (granted) localStorage.setItem(CONNECTED_KEY, id);
      return granted;
    },
    async fetchDays(from, to) {
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T23:59:59`);
      const { aggregatedData } = await Health.queryAggregated({ dataType: "steps", bucket: "day", startDate: start.toISOString(), endDate: end.toISOString() });
      return aggregatedData.map((s) => ({ date: isoDate(new Date(s.startDate)), steps: Math.round(s.value) }));
    },
  };
}

export function disconnectHealth() {
  localStorage.removeItem(CONNECTED_KEY);
}
