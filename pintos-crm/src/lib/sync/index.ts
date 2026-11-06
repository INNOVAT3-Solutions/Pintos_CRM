import "server-only";
import { and, eq, getTableColumns, gte, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import type { CustomValues } from "@/lib/db/schema";
import {
  fetchAllContacts,
  fetchAllOpportunities,
  fetchCustomFields,
  fetchPipelines,
  fetchContact,
  fetchOpportunity,
  fetchUsers,
  isNotFound,
  type RawContact,
  type RawOpportunity,
} from "@/lib/ghl/api";

/**
 * Keeps the local mirror in step with GHL.
 *
 * - Full sync: pulls contacts, deals, pipelines, custom fields and users, upserts
 *   them, and removes local rows GHL no longer has (GHL is the master).
 * - Single-record upserts: after the CRM writes to GHL, the record GHL returns is
 *   saved here, so the screen shows exactly what GHL stored.
 *
 * Until webhooks are on (phase 7), screens call ensureFresh() which re-syncs when
 * the mirror is older than FRESH_MS.
 */
const FRESH_MS = 60_000;
const SYNC_KEY = "ghl";

const d = (v?: string | null) => (v ? new Date(v) : null);
const s = (v?: string | null) => (v && v.trim() ? v.trim() : null);

export function contactDisplayName(c: Pick<RawContact, "firstName" | "lastName" | "contactName" | "companyName" | "email" | "phone">) {
  const full = [s(c.firstName), s(c.lastName)].filter(Boolean).join(" ");
  return full || s(c.contactName) || s(c.companyName) || s(c.email) || s(c.phone) || "Unnamed contact";
}

function contactRow(c: RawContact): typeof schema.ghlContacts.$inferInsert {
  const custom: CustomValues = {};
  for (const f of c.customFields ?? []) custom[f.id] = f.value ?? f.fieldValue ?? null;
  const name = contactDisplayName(c);
  const searchText = [name, c.email, c.phone, c.phone?.replace(/\D/g, ""), c.companyName, c.address1, c.city, c.postalCode]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return {
    id: c.id,
    firstName: s(c.firstName),
    lastName: s(c.lastName),
    name,
    email: s(c.email),
    phone: s(c.phone),
    companyName: s(c.companyName),
    address1: s(c.address1),
    city: s(c.city),
    state: s(c.state),
    postalCode: s(c.postalCode),
    type: s(c.type),
    source: s(c.source),
    tags: c.tags ?? [],
    assignedTo: s(c.assignedTo),
    dnd: !!c.dnd,
    custom,
    searchText,
    dateAdded: d(c.dateAdded),
    dateUpdated: d(c.dateUpdated),
    syncedAt: new Date(),
  };
}

function opportunityRow(o: RawOpportunity): typeof schema.ghlOpportunities.$inferInsert {
  return {
    id: o.id,
    name: s(o.name) ?? "Untitled deal",
    pipelineId: o.pipelineId,
    stageId: o.pipelineStageId,
    status: o.status,
    value: Number(o.monetaryValue ?? 0) || 0,
    contactId: s(o.contactId),
    assignedTo: s(o.assignedTo),
    source: s(o.source),
    createdAt: d(o.createdAt),
    updatedAt: d(o.updatedAt),
    lastStageChangeAt: d(o.lastStageChangeAt),
    syncedAt: new Date(),
  };
}

/** Postgres upsert helper: on id conflict, overwrite every column with the incoming value. */
function excludedAll(table: typeof schema.ghlContacts | typeof schema.ghlOpportunities) {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([key]) => key !== "id")
      .map(([key, col]) => [key, sql.raw(`excluded."${col.name}"`)]),
  );
}

/*
 * GHL's search endpoints (used by full sync) lag a few seconds behind its real
 * data. So an incoming row only replaces the local one if it is at least as new,
 * judged by GHL's own "last updated" timestamp. Without this, a sync right after
 * a staff edit would briefly undo it on screen.
 */
async function upsertContacts(db: Db, rows: RawContact[]) {
  if (!rows.length) return;
  const t = schema.ghlContacts;
  await db
    .insert(t)
    .values(rows.map(contactRow))
    .onConflictDoUpdate({
      target: t.id,
      set: excludedAll(t),
      setWhere: sql`${t.dateUpdated} is null or excluded."date_updated" is null or excluded."date_updated" >= ${t.dateUpdated}`,
    });
}

async function upsertOpportunities(db: Db, rows: RawOpportunity[]) {
  if (!rows.length) return;
  const t = schema.ghlOpportunities;
  await db
    .insert(t)
    .values(rows.map(opportunityRow))
    .onConflictDoUpdate({
      target: t.id,
      set: excludedAll(t),
      setWhere: sql`${t.updatedAt} is null or excluded."updated_at" is null or excluded."updated_at" >= ${t.updatedAt}`,
    });
}

/** Records seen or written this recently are only removed after GHL confirms they're gone. */
const RECENT_WRITE_GRACE_MS = 10 * 60_000;
const MAX_DIRECT_CHECKS = 25;

/** Of the recent local rows missing from GHL's search, return the ids GHL confirms no longer exist. */
async function confirmGone(
  db: Db,
  table: typeof schema.ghlContacts | typeof schema.ghlOpportunities,
  seenIds: string[],
  graceCutoff: Date,
  fetchOne: (id: string) => Promise<unknown>,
): Promise<string[]> {
  const missing = await db
    .select({ id: table.id })
    .from(table)
    .where(and(gte(table.syncedAt, graceCutoff), seenIds.length ? notInArray(table.id, seenIds) : undefined))
    .limit(MAX_DIRECT_CHECKS);
  const gone: string[] = [];
  for (const { id } of missing) {
    try {
      await fetchOne(id);
    } catch (e) {
      if (isNotFound(e)) gone.push(id);
    }
  }
  return gone;
}

export async function saveContact(raw: RawContact) {
  await upsertContacts(await getDb(), [raw]);
}

/**
 * Make sure one contact is in the mirror. A customer created in GHL seconds ago
 * may not be here yet (syncs run at most once a minute), so fetch it directly.
 * Returns false if GHL doesn't have it either.
 */
export async function ensureContact(id: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ id: schema.ghlContacts.id }).from(schema.ghlContacts).where(eq(schema.ghlContacts.id, id));
  if (row) return true;
  try {
    await upsertContacts(db, [await fetchContact(id)]);
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

export async function saveOpportunity(raw: RawOpportunity) {
  await upsertOpportunities(await getDb(), [raw]);
}

/* ---------------- Full sync ---------------- */

export interface SyncResult {
  contacts: number;
  opportunities: number;
  pipelines: number;
  ms: number;
}

async function runFullSync(): Promise<SyncResult> {
  const started = Date.now();
  const db = await getDb();
  try {
    // Fetch everything first; only touch the database once GHL has answered for all of it.
    const [contacts, opportunities, pipelines, fields, users] = await Promise.all([
      fetchAllContacts(),
      fetchAllOpportunities(),
      fetchPipelines(),
      fetchCustomFields(),
      fetchUsers(),
    ]);

    // Rows GHL no longer returns get removed. But GHL's search lags, so a record seen
    // or written within the grace window may simply not be searchable yet: for those we
    // ask GHL about the record directly and only remove it if GHL says it's gone.
    const graceCutoff = new Date(started - RECENT_WRITE_GRACE_MS);
    const contactIds = contacts.map((c) => c.id);
    const oppIds = opportunities.map((o) => o.id);
    const [goneContacts, goneOpps] = await Promise.all([
      confirmGone(
        db,
        schema.ghlContacts,
        contactIds,
        graceCutoff,
        (id) => fetchContact(id),
      ),
      confirmGone(
        db,
        schema.ghlOpportunities,
        oppIds,
        graceCutoff,
        (id) => fetchOpportunity(id),
      ),
    ]);

    await db.transaction(async (tx) => {
      const t = tx as unknown as Db;

      await upsertContacts(t, contacts);
      await t
        .delete(schema.ghlContacts)
        .where(
          and(
            contactIds.length ? notInArray(schema.ghlContacts.id, contactIds) : undefined,
            or(
              lt(schema.ghlContacts.syncedAt, graceCutoff),
              goneContacts.length ? inArray(schema.ghlContacts.id, goneContacts) : sql`false`,
            ),
          ),
        );

      await upsertOpportunities(t, opportunities);
      await t
        .delete(schema.ghlOpportunities)
        .where(
          and(
            oppIds.length ? notInArray(schema.ghlOpportunities.id, oppIds) : undefined,
            or(
              lt(schema.ghlOpportunities.syncedAt, graceCutoff),
              goneOpps.length ? inArray(schema.ghlOpportunities.id, goneOpps) : sql`false`,
            ),
          ),
        );

      // Small reference tables: replace wholesale.
      await t.delete(schema.ghlPipelines);
      if (pipelines.length) {
        await t.insert(schema.ghlPipelines).values(
          pipelines.map((p) => ({
            id: p.id,
            name: p.name,
            stages: (p.stages ?? [])
              .map((st, i) => ({ id: st.id, name: st.name, position: st.position ?? i }))
              .sort((a, b) => a.position - b.position),
          })),
        );
      }

      await t.delete(schema.ghlCustomFields);
      if (fields.length) {
        await t.insert(schema.ghlCustomFields).values(
          fields.map((f) => ({
            id: f.id,
            name: f.name,
            fieldKey: f.fieldKey,
            dataType: f.dataType,
            model: f.model,
            options: f.picklistOptions ?? [],
            position: f.position ?? 0,
          })),
        );
      }

      await t.delete(schema.ghlUsers);
      if (users.length) {
        await t.insert(schema.ghlUsers).values(
          users.map((u) => ({
            id: u.id,
            name: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "GHL user",
            email: u.email ?? null,
            role: u.roles?.role ?? null,
          })),
        );
      }

      await t
        .insert(schema.syncState)
        .values({ key: SYNC_KEY, lastSyncAt: new Date(), lastError: null })
        .onConflictDoUpdate({ target: schema.syncState.key, set: { lastSyncAt: new Date(), lastError: null } });
    });

    return { contacts: contacts.length, opportunities: opportunities.length, pipelines: pipelines.length, ms: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .insert(schema.syncState)
      .values({ key: SYNC_KEY, lastSyncAt: new Date(0), lastError: msg })
      .onConflictDoUpdate({ target: schema.syncState.key, set: { lastError: msg } });
    throw e;
  }
}

// One sync at a time per server process; concurrent callers share it.
const g = globalThis as unknown as { __pintosSync?: Promise<SyncResult> };

export function syncAll(): Promise<SyncResult> {
  if (!g.__pintosSync) {
    g.__pintosSync = runFullSync().finally(() => {
      g.__pintosSync = undefined;
    });
  }
  return g.__pintosSync;
}

export interface SyncInfo {
  lastSyncAt: Date | null;
  lastError: string | null;
}

export async function getSyncInfo(): Promise<SyncInfo> {
  const db = await getDb();
  const [row] = await db.select().from(schema.syncState).where(eq(schema.syncState.key, SYNC_KEY));
  if (!row) return { lastSyncAt: null, lastError: null };
  return { lastSyncAt: row.lastSyncAt.getTime() > 0 ? row.lastSyncAt : null, lastError: row.lastError };
}

/**
 * Re-sync if the mirror is stale. If GHL is unreachable but we have older data,
 * show that (with the error surfaced) rather than failing the page.
 */
export async function ensureFresh(): Promise<SyncInfo> {
  const info = await getSyncInfo();
  const age = info.lastSyncAt ? Date.now() - info.lastSyncAt.getTime() : Infinity;
  if (age < FRESH_MS) return info;
  try {
    await syncAll();
  } catch (e) {
    if (!info.lastSyncAt) throw e; // nothing to fall back on
  }
  return getSyncInfo();
}
