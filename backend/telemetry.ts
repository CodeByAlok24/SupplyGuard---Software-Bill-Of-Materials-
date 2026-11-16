// Telemetry provider adapter boundary.
//
// v1 ships ONLY the manual provider: values are read from rows the user typed
// into SupplyGuard. No network calls are made — ever. OpenTelemetry,
// Prometheus and CloudWatch providers are intentionally NOT implemented;
// getSloProvider returns null for them and the API serves manual data only.
//
// To add a provider later:
//   1. Implement SloProvider (isConfigured + fetchObservation).
//   2. Register it in PROVIDERS below.
//   3. Feed real config through env — never through user-controlled requests.
// Until then every SLO displayed is labeled "Manual".

export type SloObservationRequest = {
  service: string;
  environment: string;
  indicatorName: string;
  windowDays: number;
};

export type SloObservation = {
  observedValue: number;
  observedAt: Date;
  windowDays: number;
};

export interface SloProvider {
  readonly source: "manual" | "opentelemetry" | "prometheus" | "cloudwatch";
  readonly configured: boolean;
  fetchObservation(request: SloObservationRequest): Promise<SloObservation | null>;
}

/** The manual provider reads no network data; observations come from the database. */
class ManualSloProvider implements SloProvider {
  readonly source = "manual" as const;
  readonly configured = true;
  async fetchObservation(): Promise<SloObservation | null> {
    // Manual observations live in the ServiceLevelObjective table — nothing to fetch.
    return null;
  }
}

const PROVIDERS: Record<string, SloProvider> = {
  manual: new ManualSloProvider(),
};

/** Returns the provider for a source, or null when it is not registered/implemented. */
export function getSloProvider(source: string): SloProvider | null {
  return PROVIDERS[source.trim().toLowerCase()] ?? null;
}

export const TELEMETRY_STATUS = {
  manual: "available (user-entered values only)",
  opentelemetry: "not implemented",
  prometheus: "not implemented",
  cloudwatch: "not implemented",
} as const;
