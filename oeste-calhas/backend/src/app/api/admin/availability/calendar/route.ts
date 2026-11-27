import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { writeAudit } from "@/lib/admin/audit";
import { businessDateKey, findAffectedBookings, periodsFromHours } from "@/lib/availability";
import { fail, sameOrigin } from "@/lib/security";

const setupSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  closedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(31),
  acceptAffectedBookings: z.boolean().optional(),
}).strict();

const DEFAULT_PERIODS = periodsFromHours(Array.from({ length: 9 }, (_, index) => index + 8));

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);

  let body: unknown;
  try { body = await req.json(); } catch { return fail("Requisição inválida.", 400); }
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) return fail("Informe um mês válido e os dias que permanecerão fechados.", 400);

  const { month, closedDates, acceptAffectedBookings } = parsed.data;
  const today = businessDateKey(new Date());
  const todayMonth = today.slice(0, 7);
  if (month < todayMonth) return fail("Não é possível abrir vagas em um mês que já terminou.", 400);

  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(dayCount).padStart(2, "0")}`;
  const dates = Array.from({ length: dayCount }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)
    .filter((dateKey) => dateKey >= today);
  const closed = new Set(closedDates);

  if (new Date(`${firstDay}T12:00:00Z`).toISOString().slice(0, 7) !== month
    || closed.size !== closedDates.length
    || closedDates.some((dateKey) => !dateKey.startsWith(`${month}-`) || dateKey < today || !dates.includes(dateKey))) {
    return fail("Confira os dias fechados selecionados.", 400);
  }

  const periodsByDate = new Map(dates.map((dateKey) => [dateKey, closed.has(dateKey) ? [] : DEFAULT_PERIODS]));
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.availabilityException.findMany({
      where: { dateKey: { gte: firstDay, lte: lastDay } },
      select: { dateKey: true },
    });
    if (existing.some(({ dateKey }) => dateKey >= today)) return { alreadyConfigured: true, affected: [] };

    const affected = await findAffectedBookings(tx, dates, periodsByDate);
    if (affected.length > 0 && !acceptAffectedBookings) return { alreadyConfigured: false, affected };

    for (const dateKey of dates) {
      const periods = periodsByDate.get(dateKey) ?? [];
      const exception = await tx.availabilityException.create({
        data: {
          dateKey,
          kind: closed.has(dateKey) ? "BLOCK" : "CUSTOM",
          reason: closed.has(dateKey) ? "Fechado pelo calendário de disponibilidade." : null,
        },
      });
      if (periods.length > 0) {
        await tx.availabilityExceptionPeriod.createMany({
          data: periods.map((period) => ({ exceptionId: exception.id, ...period })),
        });
      }
    }

    await writeAudit(tx, {
      action: "AVAILABILITY_MONTH_OPENED",
      entity: "Availability",
      description: `Vagas abertas para ${month}; ${closed.size} dia(s) fechado(s).`,
      newValues: { month, closedDates: [...closed].sort(), periods: DEFAULT_PERIODS },
    });
    return { alreadyConfigured: false, affected: [] };
  });

  if (result.alreadyConfigured) return fail("Este mês já possui vagas configuradas.", 409);
  if (result.affected.length > 0) {
    return NextResponse.json({
      error: "A abertura do mês afeta agendamentos existentes. Revise-os antes de confirmar.",
      affectedBookings: result.affected.map(({ id, name, startsAt }) => ({ id, name, startsAt })),
    }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
