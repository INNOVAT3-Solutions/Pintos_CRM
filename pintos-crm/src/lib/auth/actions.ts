"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { endSession, needsSetup, normalizeEmail, requireAdmin, startSession } from "./index";

export interface FormState {
  error?: string;
  ok?: string;
  /**
   * What the person typed (never passwords), echoed back so fields stay filled
   * after a failed attempt — React resets forms once an action finishes.
   */
  values?: Record<string, string>;
}

/** Everything from the form except password fields. */
function keep(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form) {
    if (typeof v === "string" && !/password|confirm/i.test(k) && !k.startsWith("$")) out[k] = v;
  }
  return out;
}

const BCRYPT_COST = 12;

// Basic brute-force protection: 8 failed attempts per email per 15 minutes.
// In-memory is enough for one small team; it resets when the server restarts.
const failures = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;

/**
 * On the live site the first-time setup needs SETUP_TOKEN (so nobody who finds
 * the address first can claim the owner account). Locally it's open.
 */
function setupAllowed(token: string): boolean {
  const required = process.env.SETUP_TOKEN;
  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) return true;
  return !!required && required.length >= 16 && token === required;
}

const password = z.string().min(10, "Password must be at least 10 characters");
const email = z.string().email("Enter a valid email");
const name = z.string().trim().min(2, "Enter a name");

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1) }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password.", values: keep(form) };

  const key = normalizeEmail(parsed.data.email);
  const f = failures.get(key);
  if (f && f.n >= MAX_FAILS && f.until > Date.now()) {
    return { error: "Too many attempts. Try again in 15 minutes.", values: keep(form) };
  }

  const db = await getDb();
  const [user] = await db.select().from(schema.staff).where(eq(schema.staff.email, key)).limit(1);
  const valid = user?.active && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!user || !valid) {
    const cur = f && f.until > Date.now() ? f.n : 0;
    failures.set(key, { n: cur + 1, until: Date.now() + WINDOW_MS });
    return { error: "Email or password is incorrect.", values: keep(form) };
  }

  failures.delete(key);
  await db.update(schema.staff).set({ lastLoginAt: new Date() }).where(eq(schema.staff.id, user.id));
  await startSession(user);
  redirect("/dashboard");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/** Creates the first admin. Only works while there are zero staff accounts. */
export async function setupOwner(_: FormState, form: FormData): Promise<FormState> {
  if (!(await needsSetup())) redirect("/login");
  if (!setupAllowed(String(form.get("token") ?? ""))) return { error: "This setup link isn't valid." };
  const parsed = z
    .object({ name, email, password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", values: keep(form) };

  const db = await getDb();
  const [user] = await db
    .insert(schema.staff)
    .values({
      name: parsed.data.name,
      email: normalizeEmail(parsed.data.email),
      role: "admin",
      passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_COST),
      lastLoginAt: new Date(),
    })
    .returning();
  await startSession(user);
  redirect("/dashboard");
}

/** Admin adds a staff login. */
export async function addStaff(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = z
    .object({ name, email, password, role: z.enum(["admin", "staff"]) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", values: keep(form) };

  const db = await getDb();
  const addr = normalizeEmail(parsed.data.email);
  const [existing] = await db.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.email, addr));
  if (existing) return { error: "Someone with that email already has a login.", values: keep(form) };

  await db.insert(schema.staff).values({
    name: parsed.data.name,
    email: addr,
    role: parsed.data.role,
    passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_COST),
  });
  revalidatePath("/settings");
  return { ok: `Login created for ${parsed.data.name}. Share the password with them privately.` };
}

/** Admin turns a login on or off. Admins can't deactivate themselves (avoids locking everyone out). */
export async function setStaffActive(id: string, active: boolean) {
  const me = await requireAdmin();
  if (me.id === id) return;
  const db = await getDb();
  await db.update(schema.staff).set({ active }).where(eq(schema.staff.id, id));
  revalidatePath("/settings");
}

/** Admin links a CRM login to the GHL user it represents (for assignments and "my jobs"). */
export async function linkStaffToGhlUser(staffId: string, ghlUserId: string | null) {
  await requireAdmin();
  const db = await getDb();
  if (ghlUserId) {
    const [u] = await db.select({ id: schema.ghlUsers.id }).from(schema.ghlUsers).where(eq(schema.ghlUsers.id, ghlUserId));
    if (!u) return { error: "That GHL user doesn't exist." };
  }
  await db.update(schema.staff).set({ ghlUserId }).where(eq(schema.staff.id, staffId));
  revalidatePath("/team");
  return { ok: "Linked." };
}
