import "server-only";
import { env } from "@/lib/env";

/**
 * Thin GoHighLevel API v2 client. Runs on the server only — the private
 * integration token never reaches the browser.
 *
 * GHL allows roughly 100 requests per 10 seconds per location. On 429 or a
 * transient 5xx we back off and retry, honouring Retry-After when present.
 */
const BASE_URL = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";
const MAX_ATTEMPTS = 4;

export class GhlError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "GhlError";
  }

  /** True when the token is valid but lacks the scope for this endpoint. */
  get isMissingScope() {
    return this.status === 401 && /scope/i.test(this.message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface GhlRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  body?: unknown;
  /** Some endpoints (e.g. calendars) require a newer API version header. */
  version?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildUrl(path: string, query?: Query) {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, BASE_URL);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url;
}

export async function ghl<T = unknown>(path: string, req: GhlRequest = {}): Promise<T> {
  const { GHL_PRIVATE_TOKEN } = env();
  const url = buildUrl(path, req.query);
  const method = req.method ?? "GET";

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${GHL_PRIVATE_TOKEN}`,
        Version: req.version ?? API_VERSION,
        Accept: "application/json",
        ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      cache: "no-store",
    });

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1);
      await sleep(wait);
      continue;
    }

    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const raw = data && typeof data === "object" && "message" in data ? (data as { message: unknown }).message : null;
      const msg = raw
        ? Array.isArray(raw)
          ? raw.join("; ")
          : String(raw)
        : `GHL ${method} ${url.pathname} failed with ${res.status}`;
      throw new GhlError(msg, res.status, url.pathname, data);
    }
    return data as T;
  }
}

/** The sub-account this CRM is bound to. */
export const locationId = () => env().GHL_LOCATION_ID;
