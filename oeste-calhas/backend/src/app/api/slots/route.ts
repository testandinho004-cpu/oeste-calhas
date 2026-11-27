import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAvailableHours, getAvailableHoursForDates } from "@/lib/availability";
import { getDateRange } from "@/lib/admin/query";
import { clientIp, fail, rateLimit, tooMany } from "@/lib/security";

export async function GET(req: Request) {
  const rl = rateLimit(`slots:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const params = new URL(req.url).searchParams;
  const month = params.get("month");
  if (month !== null) {
    if (!/^(?:1\d{3}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(month)) return fail("Mês inválido.", 400);
    const [year, monthNumber] = month.split("-").map(Number);
    const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const dates = Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
    const days = await db.$transaction((tx) => getAvailableHoursForDates(tx, dates, 60, 0));
    return NextResponse.json({ days }, { headers: { "Cache-Control": "no-store" } });
  }

  const date = params.get("date") ?? "";
  if (!getDateRange(date, date)) return fail("Data inválida.", 400);
  const hours = await db.$transaction((tx) => getAvailableHours(
    tx,
    date,
    60,
    0,
  ));
  return NextResponse.json({ hours }, { headers: { "Cache-Control": "no-store" } });
}
