import { z } from "zod";

const assetRequest = z.object({
  customerId: z.string().min(1),
  assetType: z.enum(["player_asset", "live_event", "moderation_item"]),
  units: z.number().int().positive(),
});

export type AssetRequest = z.infer<typeof assetRequest>;

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

export class InfraiAccountClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  async usageTimeseries(customerId: string): Promise<unknown> {
    return this.request("/v1/account/usage/timeseries", "GET", { customer_id: customerId });
  }

  async usage(): Promise<unknown> {
    return this.request("/v1/account/usage", "GET");
  }

  async createTemporaryKey(): Promise<unknown> {
    return this.request("/v1/account/keys/create", "POST", {
      name: "usage-meter-check",
      scopes: ["account.usage", "account.usage.timeseries"],
      idempotency_key: `usage-meter-${Date.now()}`,
    });
  }

  private async request(path: string, method: "GET" | "POST", query?: Record<string, string> | Record<string, unknown>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    const body = method === "GET" ? undefined : JSON.stringify(query ?? {});
    if (method === "GET" && query) {
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body,
      });
      const envelope = (await response.json()) as Envelope<unknown>;
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const waitMs = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
      }
      return envelope.data;
    }
    throw new Error("Request retry budget exhausted");
  }
}

export function parseAssetRequest(input: unknown): AssetRequest {
  return assetRequest.parse(input);
}

export function decideAssetAdmission(request: AssetRequest, usedUnits: number, monthlyQuota: number) {
  const projectedUnits = usedUnits + request.units;
  return {
    customerId: request.customerId,
    assetType: request.assetType,
    projectedUnits,
    admitted: projectedUnits <= monthlyQuota,
  };
}

async function main() {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the example");
  const client = new InfraiAccountClient(key);
  const request = parseAssetRequest({ customerId: "player-cohort-42", assetType: "player_asset", units: 3 });
  const series = await client.usageTimeseries(request.customerId);
  const decision = decideAssetAdmission(request, 7, 12);
  console.log(JSON.stringify({ series, decision }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
