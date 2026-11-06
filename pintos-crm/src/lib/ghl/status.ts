import "server-only";
import { ghl, GhlError, locationId } from "./client";
import { MEASUREMENT_FIELD_SPECS, PROPERTY_OBJECT, propertyFields } from "./properties";

/** Thrown by a probe when GHL works but something must be set up there first. */
class NeedsSetup extends Error {}

export type CheckState = "ok" | "missing_scope" | "needs_setup" | "error";

export interface CapabilityCheck {
  key: string;
  label: string;
  /** What the CRM uses this for — shown to staff in Settings. */
  usedFor: string;
  /** Scope(s) to tick in GHL → Settings → Private Integrations if this fails. */
  scopes: string;
  state: CheckState;
  detail: string;
}

export interface GhlStatus {
  connected: boolean;
  account: { name: string; city?: string; state?: string; timezone?: string } | null;
  checks: CapabilityCheck[];
  checkedAt: string;
  /** Why the connection failed, when it did. */
  error?: string;
}

interface Probe {
  key: string;
  label: string;
  usedFor: string;
  scopes: string;
  run: (loc: string) => Promise<string>;
}

const count = (n: number | undefined, noun: string) => `${n ?? 0} ${noun}${n === 1 ? "" : "s"}`;

const PROBES: Probe[] = [
  {
    key: "contacts",
    label: "Contacts",
    usedFor: "Customers screen and leads from the website",
    scopes: "contacts.readonly, contacts.write",
    run: async (loc) => {
      const d = await ghl<{ meta?: { total?: number } }>("/contacts/", { query: { locationId: loc, limit: 1 } });
      return count(d.meta?.total, "contact");
    },
  },
  {
    key: "pipelines",
    label: "Pipeline & deals",
    usedFor: "Pipeline board, deal stages and values",
    scopes: "opportunities.readonly, opportunities.write",
    run: async (loc) => {
      const d = await ghl<{ pipelines?: { name: string; stages?: unknown[] }[] }>("/opportunities/pipelines", {
        query: { locationId: loc },
      });
      const p = d.pipelines ?? [];
      return p.map((x) => `${x.name} (${x.stages?.length ?? 0} stages)`).join(", ") || "No pipelines";
    },
  },
  {
    key: "calendars",
    label: "Calendars",
    usedFor: "Calendar screen, booking estimates and jobs",
    scopes: "calendars.readonly, calendars/events.readonly, calendars/events.write",
    run: async (loc) => {
      const d = await ghl<{ calendars?: unknown[] }>("/calendars/", { query: { locationId: loc } });
      return count(d.calendars?.length, "calendar");
    },
  },
  {
    key: "users",
    label: "Team members",
    usedFor: "Assigning leads, appointments and jobs",
    scopes: "users.readonly",
    run: async (loc) => {
      const d = await ghl<{ users?: unknown[] }>("/users/", { query: { locationId: loc } });
      return count(d.users?.length, "user");
    },
  },
  {
    key: "customFields",
    label: "Custom fields",
    usedFor: "Property type, square footage, stories, roof type…",
    scopes: "locations/customFields.readonly, locations/customFields.write",
    run: async (loc) => {
      const d = await ghl<{ customFields?: unknown[] }>(`/locations/${loc}/customFields`);
      return count(d.customFields?.length, "field");
    },
  },
  {
    key: "objects",
    label: "Custom objects",
    usedFor: "Properties (measurements) and Jobs",
    scopes: "objects/schema.readonly, objects/schema.write, objects/record.readonly, objects/record.write",
    run: async (loc) => {
      const d = await ghl<{ objects?: { key: string; labels?: { plural?: string } }[] }>("/objects/", {
        query: { locationId: loc },
      });
      const custom = (d.objects ?? []).filter((o) => o.key.startsWith("custom_objects."));
      return custom.map((o) => o.labels?.plural ?? o.key).join(", ") || "None yet";
    },
  },
  {
    key: "products",
    label: "Products & prices",
    usedFor: "Service price list for estimates",
    scopes: "products.readonly",
    run: async (loc) => {
      const d = await ghl<{ products?: unknown[]; total?: { total?: number }[] }>("/products/", {
        query: { locationId: loc, limit: 100 },
      });
      return count(d.products?.length, "product");
    },
  },
  {
    key: "estimates",
    label: "Estimates",
    usedFor: "Sending estimates from GHL to the customer",
    scopes: "invoices/estimate.readonly, invoices/estimate.write",
    run: async (loc) => {
      const d = await ghl<{ total?: number }>("/invoices/estimate/list", {
        query: { altId: loc, altType: "location", limit: 1, offset: 0 },
      });
      return count(d.total, "estimate");
    },
  },
  {
    key: "invoices",
    label: "Invoices",
    usedFor: "Deposits, invoices and revenue",
    scopes: "invoices.readonly, invoices.write",
    run: async (loc) => {
      const d = await ghl<{ total?: number }>("/invoices/", {
        query: { altId: loc, altType: "location", limit: 1, offset: 0 },
      });
      return count(d.total, "invoice");
    },
  },
  {
    key: "conversations",
    label: "Conversations",
    usedFor: "Texting customers from the CRM",
    scopes: "conversations.readonly, conversations.write, conversations/message.readonly, conversations/message.write",
    run: async (loc) => {
      const d = await ghl<{ total?: number }>("/conversations/search", { query: { locationId: loc, limit: 1 } });
      return count(d.total, "conversation");
    },
  },
  {
    key: "propertyLinks",
    label: "Property links",
    usedFor: "Linking measured properties to the customer",
    scopes: "associations/relation.readonly, associations/relation.write",
    run: async (loc) => {
      try {
        await ghl(`/associations/relations/${loc}`, { query: { locationId: loc, skip: 0, limit: 1 } });
      } catch (e) {
        if (e instanceof GhlError && e.isMissingScope) throw e;
        // Any other answer (e.g. "record not found") means the permission is there.
      }
      return "Can link Properties ↔ Contacts";
    },
  },
  {
    key: "measurementFields",
    label: "Measurement fields",
    usedFor: "Per-surface areas on each Property (roof, walls, driveway, patio)",
    scopes: "objects/schema.readonly",
    run: async () => {
      const defs = await propertyFields();
      const missing = MEASUREMENT_FIELD_SPECS.filter((f) => !defs.has(f.key));
      if (missing.length) {
        throw new NeedsSetup(
          `In GHL → Settings → Objects → Properties, add: ${missing.map((f) => `“${f.name}” (${f.type}, key ${f.key})`).join("; ")}`,
        );
      }
      return `All ${MEASUREMENT_FIELD_SPECS.length} present on ${PROPERTY_OBJECT.replace("custom_objects.", "")}`;
    },
  },
  {
    key: "planFields",
    label: "Plan fields",
    usedFor: "Writing a customer's maintenance plan onto their contact",
    scopes: "locations/customFields.readonly",
    run: async (loc) => {
      const d = await ghl<{ customFields?: { fieldKey: string; name: string; picklistOptions?: string[] }[] }>(
        `/locations/${loc}/customFields`,
      );
      const byKey = new Map((d.customFields ?? []).map((f) => [f.fieldKey, f]));
      const problems: string[] = [];
      const cycle = byKey.get("contact.plan_billing_cycle");
      if (!cycle) problems.push("the “Plan Billing Cycle” field is missing");
      else {
        const has = (o: string) => cycle.picklistOptions?.some((x) => x.toLowerCase() === o.toLowerCase());
        const missing = ["Every 2 Months", "Quarterly", "Semi-Annual"].filter((o) => !has(o));
        if (missing.length) problems.push(`add options ${missing.map((m) => `“${m}”`).join(", ")} to “Plan Billing Cycle” (it only has ${cycle.picklistOptions?.join(", ")})`);
      }
      const inc = byKey.get("contact.included_services");
      if (inc && (inc.picklistOptions?.length ?? 0) < 6) {
        problems.push(`“Included Services” only lists ${inc.picklistOptions?.join(", ")} — add the other plan services (windows, sidewalk, patio…) so they can be ticked`);
      }
      if (problems.length) throw new NeedsSetup(`Plans still work; these just can't be recorded on the contact yet: ${problems.join("; ")}.`);
      return "Billing cycles and included services all present";
    },
  },
  {
    key: "payments",
    label: "Payments",
    usedFor: "Financials screen",
    scopes: "payments/transactions.readonly, payments/orders.readonly",
    run: async (loc) => {
      const d = await ghl<{ totalCount?: number }>("/payments/transactions", {
        query: { altId: loc, altType: "location", limit: 1 },
      });
      return count(d.totalCount, "transaction");
    },
  },
];

export async function getGhlStatus(): Promise<GhlStatus> {
  const checkedAt = new Date().toISOString();
  let loc: string;
  try {
    loc = locationId();
  } catch (e) {
    return { connected: false, account: null, checks: [], checkedAt, error: (e as Error).message };
  }

  let account: GhlStatus["account"] = null;
  try {
    const d = await ghl<{ location: { name: string; city?: string; state?: string; timezone?: string } }>(
      `/locations/${loc}`,
    );
    account = { name: d.location.name, city: d.location.city, state: d.location.state, timezone: d.location.timezone };
  } catch (e) {
    return { connected: false, account: null, checks: [], checkedAt, error: (e as Error).message };
  }

  const checks = await Promise.all(
    PROBES.map(async (p): Promise<CapabilityCheck> => {
      const base = { key: p.key, label: p.label, usedFor: p.usedFor, scopes: p.scopes };
      try {
        return { ...base, state: "ok", detail: await p.run(loc) };
      } catch (e) {
        if (e instanceof GhlError && e.isMissingScope) {
          return { ...base, state: "missing_scope", detail: "Permission not granted on the token" };
        }
        if (e instanceof NeedsSetup) return { ...base, state: "needs_setup", detail: e.message };
        return { ...base, state: "error", detail: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  return { connected: true, account, checks, checkedAt };
}
