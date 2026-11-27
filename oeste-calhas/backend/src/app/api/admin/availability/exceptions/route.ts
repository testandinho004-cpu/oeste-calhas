import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { writeAudit } from "@/lib/admin/audit";
import { findAffectedBookings } from "@/lib/availability";
import { fail, sameOrigin } from "@/lib/security";

const periodSchema = z.object({
  opensAt: z.string().regex(/^(0[8-9]|1[0-6]):00$/),
  closesAt: z.string().regex(/^(0[9]|1[0-7]):00$/),
}).strict();
const periodsSchema = z.array(periodSchema).max(9).superRefine((periods, context) => {
  const sorted = [...periods].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  for (const [index, period] of sorted.entries()) {
    if (period.opensAt >= period.closesAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: "O fechamento deve ser posterior à abertura." });
    }
    if (index > 0 && sorted[index - 1].closesAt > period.opensAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: "Os períodos não podem se sobrepor." });
    }
  }
});
const exceptionSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["BLOCK", "CUSTOM"]),
  reason: z.string().trim().max(250).optional(),
  periods: periodsSchema,
  acceptAffectedBookings: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  const date = new Date(`${value.dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.dateKey) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dateKey"], message: "Data inválida." });
  }
  if (value.kind === "BLOCK" && value.periods.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["periods"], message: "Um bloqueio não pode conter períodos abertos." });
  }
  if (value.kind === "CUSTOM" && value.periods.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["periods"], message: "Informe ao menos um período especial." });
  }
});
const deleteSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acceptAffectedBookings: z.boolean().optional(),
}).strict();

export async function GET(req: Request) {
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  const params = new URL(req.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const where = from || to ? {
    dateKey: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  } : {};
  const exceptions = await db.availabilityException.findMany({
    where,
    include: { periods: { orderBy: { opensAt: "asc" } } },
    orderBy: { dateKey: "asc" },
    take: 200,
  });
  return NextResponse.json({ exceptions }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  let body: unknown;
  try { body = await req.json(); } catch { return fail("Requisição inválida.", 400); }
  const parsed = exceptionSchema.safeParse(body);
  if (!parsed.success) return fail("Confira a data, o tipo e os horários da exceção.", 400);
  const data = parsed.data;

  const result = await db.$transaction(async (tx) => {
    const affected = await findAffectedBookings(tx, [data.dateKey], new Map([[data.dateKey, data.periods]]));
    if (affected.length > 0 && !data.acceptAffectedBookings) return { affected };
    const existing = await tx.availabilityException.findUnique({ where: { dateKey: data.dateKey } });
    const exception = await tx.availabilityException.upsert({
      where: { dateKey: data.dateKey },
      create: { dateKey: data.dateKey, kind: data.kind, reason: data.reason || null },
      update: { kind: data.kind, reason: data.reason || null },
    });
    await tx.availabilityExceptionPeriod.deleteMany({ where: { exceptionId: exception.id } });
    if (data.periods.length > 0) {
      await tx.availabilityExceptionPeriod.createMany({
        data: data.periods.map((period) => ({ exceptionId: exception.id, ...period })),
      });
    }
    await writeAudit(tx, {
      action: existing ? "AVAILABILITY_EXCEPTION_UPDATED" : "AVAILABILITY_EXCEPTION_CREATED",
      entity: "AvailabilityException",
      entityId: String(exception.id),
      description: `${data.kind === "BLOCK" ? "Bloqueio" : "Horário especial"} configurado para ${data.dateKey}.`,
      previousValues: existing ? { kind: existing.kind } : undefined,
      newValues: { dateKey: data.dateKey, kind: data.kind, periods: data.periods },
    });
    return { affected: [] };
  });

  if (result.affected.length > 0) {
    return NextResponse.json({
      error: "A exceção afeta agendamentos existentes. Revise-os antes de confirmar.",
      affectedBookings: result.affected.map(({ id, name, startsAt }) => ({ id, name, startsAt })),
    }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  let body: unknown;
  try { body = await req.json(); } catch { return fail("Requisição inválida.", 400); }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return fail("Data inválida.", 400);
  const { dateKey } = parsed.data;

  const result = await db.$transaction(async (tx) => {
    const exception = await tx.availabilityException.findUnique({ where: { dateKey } });
    if (!exception) return { missing: true, affected: [] as { id: string; name: string; startsAt: Date }[] };
    const affected = await findAffectedBookings(tx, [dateKey], new Map([[dateKey, []]]));
    if (affected.length > 0 && !parsed.data.acceptAffectedBookings) return { missing: false, affected };
    await tx.availabilityException.delete({ where: { id: exception.id } });
    await writeAudit(tx, {
      action: "AVAILABILITY_EXCEPTION_DELETED",
      entity: "AvailabilityException",
      entityId: String(exception.id),
      description: `Exceção de disponibilidade removida para ${dateKey}.`,
      previousValues: { dateKey, kind: exception.kind },
    });
    return { missing: false, affected: [] as { id: string; name: string; startsAt: Date }[] };
  });

  if (result.missing) return fail("Exceção não encontrada.", 404);
  if (result.affected.length > 0) {
    return NextResponse.json({
      error: "A remoção afeta agendamentos existentes. Revise-os antes de confirmar.",
      affectedBookings: result.affected.map(({ id, name, startsAt }) => ({ id, name, startsAt })),
    }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
