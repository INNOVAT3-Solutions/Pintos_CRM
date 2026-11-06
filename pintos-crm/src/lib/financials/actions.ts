"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { EXPENSE_CATEGORIES } from "@/lib/db/schema";

export interface ExpenseResult {
  ok?: string;
  error?: string;
}

const expenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  vendor: z.string().trim().min(1, "Who was it paid to?").max(120),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive("Enter an amount").max(1_000_000),
  notes: z.string().max(500),
});

export async function addExpense(input: z.infer<typeof expenseSchema>): Promise<ExpenseResult> {
  const user = await requireUser();
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the expense." };
  const db = await getDb();
  await db.insert(schema.expenses).values({ ...parsed.data, staffId: user.id, staffName: user.name });
  revalidatePath("/financials");
  revalidatePath("/dashboard");
  return { ok: "Expense added." };
}

export async function deleteExpense(id: string): Promise<ExpenseResult> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) return { error: "Unknown expense." };
  const db = await getDb();
  await db.delete(schema.expenses).where(eq(schema.expenses.id, id));
  revalidatePath("/financials");
  revalidatePath("/dashboard");
  return { ok: "Expense removed." };
}
