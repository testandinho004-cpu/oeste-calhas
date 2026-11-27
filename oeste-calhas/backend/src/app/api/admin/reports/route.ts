import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { getDateRange, localDateString } from "@/lib/admin/query";
import { fail } from "@/lib/security";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em andamento",
  DONE: "Finalizado",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(req: Request) {
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  const params = new URL(req.url).searchParams;
  const preset = params.get("preset") ?? "30d";
  const today = localDateString();

  let from = params.get("from");
  let to = params.get("to");
  if (preset === "today") { from = today; to = today; }
  if (preset === "7d") { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 6); from = date.toISOString().slice(0, 10); to = today; }
  if (preset === "30d") { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 29); from = date.toISOString().slice(0, 10); to = today; }
  if (preset === "month") {
    const date = new Date(`${today}T12:00:00Z`);
    from = `${today.slice(0, 7)}-01`;
    to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  }
  if (preset === "previous-month") {
    const date = new Date(`${today}T12:00:00Z`);
    const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0));
    from = first.toISOString().slice(0, 10);
    to = last.toISOString().slice(0, 10);
  }

  const range = getDateRange(from, to);
  if (!range) return fail("Período inválido.", 400);
  const period = { gte: range.start, lt: range.endExclusive };
  const [bookings, customersInPeriod, customerTotal, statusRows, recurringIds] = await Promise.all([
    db.booking.findMany({
      where: { startsAt: period },
      orderBy: { startsAt: "asc" },
      select: { id: true, name: true, phone: true, description: true, address: true, startsAt: true, status: true, createdAt: true, durationMinutes: true, cancellationReason: true },
    }),
    db.customer.count({ where: { createdAt: period } }),
    db.customer.count(),
    db.booking.groupBy({ by: ["status"], where: { startsAt: period }, _count: { _all: true } }),
    db.booking.groupBy({ by: ["customerId"], where: { customerId: { not: null }, startsAt: period }, _count: { _all: true } }),
  ]);

  const countStatus = (status: string) => statusRows.find((row) => row.status === status)?._count._all ?? 0;
  const total = bookings.length;
  const finalized = countStatus("DONE");
  const cancelled = countStatus("CANCELLED");
  const demandByDay = new Map<string, number>();
  const demandByHour = new Map<number, number>();
  for (const booking of bookings) {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife", weekday: "long" }).format(booking.startsAt);
    demandByDay.set(key, (demandByDay.get(key) ?? 0) + 1);
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Recife", hour: "2-digit", hour12: false }).format(booking.startsAt));
    demandByHour.set(hour, (demandByHour.get(hour) ?? 0) + 1);
  }
  const mostDemanded = (values: Map<string, number>) => [...values.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const hourEntries = [...demandByHour.entries()].sort((a, b) => b[1] - a[1]);
  const report = {
    range: { from: range.from, to: range.to },
    metrics: {
      total,
      finalized,
      cancellationRate: total ? cancelled / total : 0,
      completionRate: total ? finalized / total : 0,
      newCustomers: customersInPeriod,
      recurringCustomers: recurringIds.filter((row) => row._count._all > 1).length,
      totalCustomers: customerTotal,
    },
    statusDistribution: statusRows.map((row) => ({ status: row.status, label: STATUS_LABEL[row.status] ?? row.status, count: row._count._all })),
    busiestDay: mostDemanded(demandByDay),
    busiestHour: hourEntries[0] ? [`${String(hourEntries[0][0]).padStart(2, "0")}:00`, hourEntries[0][1]] : null,
  };

  if (params.get("format") === "csv") {
    const header = ["ID", "Nome", "Telefone", "Descrição", "Endereço", "Data/hora", "Status", "Criado em", "Duração (min)", "Motivo de cancelamento"];
    const rows = bookings.map((booking) => [
      booking.id,
      booking.name,
      booking.phone,
      booking.description,
      booking.address,
      booking.startsAt.toISOString(),
      STATUS_LABEL[booking.status] ?? booking.status,
      booking.createdAt.toISOString(),
      booking.durationMinutes,
      booking.cancellationReason ?? "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    return new NextResponse(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="agendamentos-${range.from}-${range.to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return NextResponse.json({ ...report, bookings }, { headers: { "Cache-Control": "private, no-store" } });
}
