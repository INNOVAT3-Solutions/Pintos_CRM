import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSchedule, parseScheduleQuery } from "@/lib/calendar/schedule";

export const dynamic = "force-dynamic";

/** Calendar data for the Day / Week / Month views (Calendar screen and dashboard). */
export async function GET(req: NextRequest) {
  // The middleware already requires sign-in for /api; check again so this never leaks if that changes.
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const q = parseScheduleQuery({ view: p.get("view") ?? undefined, date: p.get("date") ?? undefined, person: p.get("person") ?? undefined });
  const data = await getSchedule(q);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
