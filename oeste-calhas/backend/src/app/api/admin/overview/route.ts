import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { fail } from "@/lib/security";
import { getDateRange, localDateString } from "@/lib/admin/query";

export async function GET(req: Request) {
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);

  const params = new URL(req.url).searchParams;
  const today = localDateString();
  const from = params.get("from") ?? today;
  const range = getDateRange(from, params.get("to") ?? from);
  if (!range) return fail("Período inválido.", 400);

  const period = { gte: range.start, lt: range.endExclusive };
  const todayRange = getDateRange(today, today);
  if (!todayRange) return fail("Data atual inválida.", 500);
  const [totalAppointments, todayTotal, statuses, customers, linkedNewCustomers, unlinkedNewCustomers, pending, upcoming, recentCancellations] = await Promise.all([
    db.booking.count({ where: { startsAt: period } }),
    db.booking.count({ where: { startsAt: { gte: todayRange.start, lt: todayRange.endExclusive } } }),
    db.booking.groupBy({
      by: ["status"],
      where: { startsAt: period },
      _count: { _all: true },
    }),
    db.customer.count(),
    db.customer.count({
      where: { userId: { not: null }, user: { is: { createdAt: period } } },
    }),
    db.customer.count({ where: { userId: null, createdAt: period } }),
    db.booking.count({ where: { status: "PENDING" } }),
    db.booking.findMany({
      where: {
        startsAt: { gte: new Date() },
        status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
      },
      orderBy: { startsAt: "asc" },
      take: 8,
      select: {
        id: true,
        name: true,
        phone: true,
        description: true,
        startsAt: true,
        status: true,
      },
    }),
    db.auditLog.findMany({
      where: { entity: "Booking", action: "BOOKING_STATUS_CHANGED", createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, entityId: true, description: true, createdAt: true },
    }),
  ]);
  const count = (status: string) => statuses.find((item) => item.status === status)?._count._all ?? 0;
  const newCustomers = linkedNewCustomers + unlinkedNewCustomers;
  const cancellations = recentCancellations
    .filter((entry) => entry.description.includes("para CANCELLED."))
    .slice(0, 5);

  return NextResponse.json({
    range: { from: range.from, to: range.to },
    metrics: {
      totalAppointments,
      todayTotal,
      pending: count("PENDING"),
      confirmed: count("CONFIRMED"),
      inProgress: count("IN_PROGRESS"),
      done: count("DONE"),
      cancelled: count("CANCELLED"),
      noShow: count("NO_SHOW"),
      totalCustomers: customers,
      newCustomers,
    },
    alerts: { pending, recentCancellations: cancellations },
    upcoming,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
