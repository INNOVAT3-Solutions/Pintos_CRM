import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Staff } from "@/lib/db/schema";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "./session";

export type CurrentUser = Pick<Staff, "id" | "email" | "name" | "role" | "ghlUserId">;

/** The signed-in, still-active staff member for this request, or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const db = await getDb();
  const [row] = await db.select().from(schema.staff).where(eq(schema.staff.id, claims.sub)).limit(1);
  if (!row || !row.active) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, ghlUserId: row.ghlUserId };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export async function startSession(user: Pick<Staff, "id" | "role">) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession({ sub: user.id, role: user.role }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** First-run: no staff accounts yet means the owner still needs to create the first admin. */
export async function needsSetup(): Promise<boolean> {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.staff);
  return n === 0;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
