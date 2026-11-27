import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { writeAudit } from "@/lib/admin/audit";
import { businessDateKey, getBookingPolicy, type AvailabilityPeriod } from "@/lib/availability";
import { fail, sameOrigin } from "@/lib/security";

const periodSchema = z.object({
  opensAt: z.string().regex(/^(0\d|1\d|2[0-3]):00$/),
  closesAt: z.string().regex(/^(0\d|1\d|2[0-3]):00$/),
}).strict();
const weeklySchema = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  enabled: z.boolean(),
  periods: z.array(periodSchema).max(4),
}).strict()).length(7).superRefine((days, context) => {
  const weekdays = new Set<number>();
  for (const [index, day] of days.entries()) {
    if (weekdays.has(day.weekday)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "weekday"], message: "Dia da semana duplicado." });
    }
    weekdays.add(day.weekday);
    const sorted = [...day.periods].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    for (const [periodIndex, period] of sorted.entries()) {
      if (period.opensAt >= period.closesAt) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "periods", periodIndex], message: "O fechamento deve ser posterior à abertura." });
      }
      if (periodIndex > 0 && sorted[periodIndex - 1].closesAt > period.opensAt) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "periods", periodIndex], message: "Os períodos não podem se sobrepor." });
      }
    }
    if (day.enabled && day.periods.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "periods"], message: "Informe ao menos um período para um dia ativo." });
    }
  }
});
const policySchema = z.object({
  minimumLeadHours: z.number().int().min(0).max(720),
  maximumDaysAhead: z.number().int().min(1).max(180).optional(),
  cancellationCutoffHours: z.number().int().min(0).max(720),
}).strict();
const saveSchema = z.object({
  weekly: weeklySchema.optional(),
  policy: policySchema,
  acceptAffectedBookings: z.boolean().optional(),
}).strict();

function timeInMinutes(value: string) {
  const [hours] = value.split(":").map(Number);
  return hours * 60;
}

function fitsInPeriods(start: Date, durationMinutes: number, periods: AvailabilityPeriod[]) {
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Recife",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(start);
  const hour = Number(timeParts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(timeParts.find((part) => part.type === "minute")?.value ?? 0);
  const bookingStart = hour * 60 + minute;
  return periods.some((period) => bookingStart >= timeInMinutes(period.opensAt)
    && bookingStart + durationMinutes <= timeInMinutes(period.closesAt));
}

async function findAffectedBookings(
  tx: Parameters<typeof getBookingPolicy>[0],
  newWeekly: z.infer<typeof weeklySchema>,
) {
  const currentPolicy = await getBookingPolicy(tx);
  const end = new Date(Date.now() + currentPolicy.maximumDaysAhead * 24 * 60 * 60_000);
  const bookings = await tx.booking.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
      slotKey: { not: null },
      startsAt: { gte: new Date(), lte: end },
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, name: true, startsAt: true, durationMinutes: true },
  });
  const dateKeys = [...new Set(bookings.map((booking) => businessDateKey(booking.startsAt)))];
  const exceptions = await tx.availabilityException.findMany({
    where: { dateKey: { in: dateKeys } },
    include: { periods: true },
  });
  const exceptionByDate = new Map(exceptions.map((exception) => [exception.dateKey, exception]));
  const weeklyByDay = new Map(newWeekly.map((day) => [day.weekday, day]));
  const affected = [];

  for (const booking of bookings) {
    const dateKey = businessDateKey(booking.startsAt);
    const exception = exceptionByDate.get(dateKey);
    let periods: AvailabilityPeriod[];
    if (exception) {
      periods = exception.kind === "CUSTOM"
        ? exception.periods.map(({ opensAt, closesAt }) => ({ opensAt, closesAt }))
        : [];
    } else {
      const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
      const day = weeklyByDay.get(weekday);
      periods = day
        ? day.enabled ? day.periods : []
        : weekday === 0 ? [] : [{ opensAt: "08:00", closesAt: "17:00" }];
    }
    if (!fitsInPeriods(booking.startsAt, booking.durationMinutes, periods)) affected.push(booking);
  }
  return affected;
}

export async function GET(req: Request) {
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  const result = await db.$transaction(async (tx) => {
    const [rows, exceptions, policy] = await Promise.all([
      tx.weeklyAvailability.findMany({ include: { periods: { orderBy: { opensAt: "asc" } } }, orderBy: { weekday: "asc" } }),
      tx.availabilityException.findMany({ include: { periods: { orderBy: { opensAt: "asc" } } }, orderBy: { dateKey: "asc" }, take: 200 }),
      tx.bookingPolicy.findUnique({ where: { id: 1 } }),
    ]);
    const weekly = Array.from({ length: 7 }, (_, weekday) => {
      const saved = rows.find((row) => row.weekday === weekday);
      if (saved) return saved;
      const enabled = weekday !== 0;
      return {
        weekday,
        enabled,
        periods: enabled ? [{ opensAt: "08:00", closesAt: "17:00" }] : [],
      };
    });
    return {
      weekly,
      exceptions,
      policy: policy ? {
        minimumLeadHours: policy.minimumLeadHours,
        maximumDaysAhead: policy.maximumDaysAhead,
        cancellationCutoffHours: policy.cancellationCutoffHours,
      } : { minimumLeadHours: 12, maximumDaysAhead: 30, cancellationCutoffHours: 0 },
    };
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  let body: unknown;
  try { body = await req.json(); } catch { return fail("Requisição inválida.", 400); }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return fail("Confira a programação e as regras de agendamento.", 400);

  const result = await db.$transaction(async (tx) => {
    const weekly = parsed.data.weekly;
    const affected = weekly ? await findAffectedBookings(tx, weekly) : [];
    if (affected.length > 0 && !parsed.data.acceptAffectedBookings) return { affected };

    const previousWeekly = weekly ? await tx.weeklyAvailability.findMany({
      include: { periods: { orderBy: { opensAt: "asc" } } },
      orderBy: { weekday: "asc" },
    }) : [];
    const previousPolicy = await getBookingPolicy(tx);
    if (weekly) {
      for (const day of weekly) {
        const schedule = await tx.weeklyAvailability.upsert({
          where: { weekday: day.weekday },
          create: { weekday: day.weekday, enabled: day.enabled },
          update: { enabled: day.enabled },
        });
        await tx.weeklyAvailabilityPeriod.deleteMany({ where: { scheduleId: schedule.id } });
        if (day.periods.length > 0) {
          await tx.weeklyAvailabilityPeriod.createMany({
            data: day.periods.map((period) => ({
              scheduleId: schedule.id,
              opensAt: period.opensAt,
              closesAt: period.closesAt,
            })),
          });
        }
      }
    }
    await tx.bookingPolicy.upsert({
      where: { id: 1 },
      create: { id: 1, ...parsed.data.policy },
      update: parsed.data.policy,
    });
    await writeAudit(tx, {
      action: "AVAILABILITY_UPDATED",
      entity: "Availability",
      description: weekly ? "Programação semanal e regras de agendamento atualizadas." : "Regras de agendamento atualizadas.",
      previousValues: {
        ...(weekly ? { weekly: previousWeekly.map(({ weekday, enabled, periods }) => ({ weekday, enabled, periods: periods.map(({ opensAt, closesAt }) => ({ opensAt, closesAt })) })) } : {}),
        policy: previousPolicy,
      },
      newValues: { ...(weekly ? { weekly } : {}), policy: parsed.data.policy },
    });
    return { affected: [] };
  });

  if (result.affected.length > 0) {
    return NextResponse.json({
      error: "A alteração afeta agendamentos existentes. Revise-os antes de confirmar.",
      affectedBookings: result.affected.map(({ id, name, startsAt }) => ({ id, name, startsAt })),
    }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
