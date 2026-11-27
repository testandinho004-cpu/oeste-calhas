import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { bookingInputSchema, statusSchema } from "@/lib/validation";
import { canTransitionBooking } from "@/lib/admin/bookingStatus";
import { writeAudit } from "@/lib/admin/audit";
import { slotKey, slotStart } from "@/lib/slots";
import { getSlotError, releaseBookingSlots, reserveBookingSlots } from "@/lib/availability";
import { fail, sameOrigin } from "@/lib/security";

const editSchema = z.object({
  name: bookingInputSchema.shape.name,
  country: bookingInputSchema.shape.country.optional(),
  phone: z.string().regex(/^\d{5,15}$/).optional(),
  address: bookingInputSchema.shape.address,
  description: bookingInputSchema.shape.description,
}).partial().strict();

const notesSchema = z.object({ internalNotes: z.string().max(2000) }).strict();
const rescheduleSchema = z.object({
  action: z.literal("reschedule"),
  date: bookingInputSchema.shape.date,
  hour: bookingInputSchema.shape.hour,
}).strict();
const reasonSchema = z.string().trim().min(3).max(500);

function isUniqueConstraint(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  const [booking, history] = await Promise.all([
    db.booking.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { email: true } },
        customer: true,
      },
    }),
    db.auditLog.findMany({
      where: { entity: "Booking", entityId: params.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  if (!booking) return fail("Agendamento não encontrado.", 404);
  return NextResponse.json({ booking, history }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);

  let body: unknown;
  try { body = await req.json(); } catch { return fail("Requisição inválida.", 400); }

  const legacyStatus = statusSchema.safeParse(body);
  const statusAction = legacyStatus.success
    ? { status: legacyStatus.data.status, reason: undefined }
    : null;
  if (statusAction) return applyStatus(params.id, statusAction.status, statusAction.reason);

  const reschedule = rescheduleSchema.safeParse(body);
  if (reschedule.success) {
    const startsAt = slotStart(reschedule.data.date, reschedule.data.hour);
    try {
      await db.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({ where: { id: params.id } });
        if (!booking) throw new BookingOperationError("Agendamento não encontrado.", 404);
        if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
          throw new BookingOperationError("Somente agendamentos pendentes ou confirmados podem ser reagendados.", 409);
        }
        const existingReservationCount = await tx.bookingReservation.count({ where: { bookingId: booking.id } });
        const bufferMinutes = Math.max(0, existingReservationCount * 60 - booking.durationMinutes);
        const slotError = await getSlotError(tx, reschedule.data.date, reschedule.data.hour, booking.durationMinutes, bufferMinutes, booking.id);
        if (slotError) throw new BookingOperationError(slotError, 409);
        await releaseBookingSlots(tx, booking.id);
        const result = await tx.booking.updateMany({
          where: { id: booking.id, status: booking.status, updatedAt: booking.updatedAt },
          data: { startsAt, slotKey: slotKey(startsAt) },
        });
        if (result.count !== 1) throw new BookingOperationError("O agendamento foi alterado por outra operação.", 409);
        await reserveBookingSlots(tx, booking.id, startsAt, booking.durationMinutes, bufferMinutes);
        await writeAudit(tx, {
          action: "BOOKING_RESCHEDULED",
          entity: "Booking",
          entityId: booking.id,
          description: "Data e horário do agendamento foram alterados.",
          previousValues: { startsAt: booking.startsAt.toISOString() },
          newValues: { startsAt: startsAt.toISOString() },
        });
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof BookingOperationError) return fail(error.message, error.status);
      if (isUniqueConstraint(error)) return fail("Esse horário acabou de ser reservado. Escolha outro.", 409);
      throw error;
    }
  }

  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (raw.action === "status") {
    const parsed = statusSchema.safeParse({ status: raw.status });
    if (!parsed.success) return fail("Status inválido.", 400);
    const reason = typeof raw.reason === "string" ? raw.reason : undefined;
    return applyStatus(params.id, parsed.data.status, reason);
  }

  if (raw.action === "notes") {
    const parsed = notesSchema.safeParse({ internalNotes: raw.internalNotes });
    if (!parsed.success) return fail("Observação inválida.", 400);
    try {
      await db.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({ where: { id: params.id } });
        if (!booking) throw new BookingOperationError("Agendamento não encontrado.", 404);
        await tx.booking.update({ where: { id: booking.id }, data: { internalNotes: parsed.data.internalNotes.trim() || null } });
        await writeAudit(tx, {
          action: "BOOKING_NOTES_UPDATED",
          entity: "Booking",
          entityId: booking.id,
          description: "Observação interna do agendamento foi alterada.",
        });
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof BookingOperationError) return fail(error.message, error.status);
      throw error;
    }
  }

  if (raw.action === "edit") {
    const parsed = editSchema.safeParse(raw.values);
    if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return fail("Dados inválidos.", 400);
    const values = parsed.data;
    let phone: string | undefined;
    if (values.phone !== undefined) {
      if (!values.country) return fail("Selecione o país do telefone.", 400);
      const parsedPhone = parsePhoneNumberFromString(values.phone, values.country as CountryCode);
      if (!parsedPhone?.isValid()) return fail("Número de telefone inválido.", 400);
      phone = parsedPhone.number;
    }
    try {
      await db.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({ where: { id: params.id } });
        if (!booking) throw new BookingOperationError("Agendamento não encontrado.", 404);
        const update = {
          ...(values.name !== undefined ? { name: values.name } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(values.address !== undefined ? { address: values.address } : {}),
          ...(values.description !== undefined ? { description: values.description } : {}),
        };
        await tx.booking.update({ where: { id: booking.id }, data: update });
        await writeAudit(tx, {
          action: "BOOKING_EDITED",
          entity: "Booking",
          entityId: booking.id,
          description: "Dados do agendamento foram editados pelo painel.",
          newValues: { fields: Object.keys(update) },
        });
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof BookingOperationError) return fail(error.message, error.status);
      if (isUniqueConstraint(error)) return fail("O telefone já está associado a outro cliente.", 409);
      throw error;
    }
  }

  return fail("Ação inválida.", 400);
}

class BookingOperationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BookingOperationError";
  }
}

async function applyStatus(id: string, nextStatus: "CONFIRMED" | "IN_PROGRESS" | "DONE" | "CANCELLED" | "NO_SHOW", reason?: string) {
  const cancellationReason = nextStatus === "CANCELLED" ? reasonSchema.safeParse(reason) : null;
  if (nextStatus === "CANCELLED" && !cancellationReason?.success) {
    return fail("Informe o motivo do cancelamento.", 400);
  }

  try {
    await db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id } });
      if (!booking) throw new BookingOperationError("Agendamento não encontrado.", 404);
      if (!canTransitionBooking(booking.status, nextStatus)) {
        throw new BookingOperationError(`Transição de ${booking.status} para ${nextStatus} não permitida.`, 409);
      }
      if (nextStatus === "NO_SHOW" && booking.startsAt.getTime() > Date.now()) {
        throw new BookingOperationError("Não é possível registrar falta antes do horário do atendimento.", 409);
      }
      const result = await tx.booking.updateMany({
        where: { id: booking.id, status: booking.status, updatedAt: booking.updatedAt },
        data: {
          status: nextStatus,
          ...(nextStatus === "CANCELLED"
            ? { slotKey: null, cancellationReason: cancellationReason?.success ? cancellationReason.data : null }
            : {}),
        },
      });
      if (result.count !== 1) throw new BookingOperationError("O agendamento foi alterado por outra operação.", 409);
      if (["CANCELLED", "DONE", "NO_SHOW"].includes(nextStatus)) await releaseBookingSlots(tx, booking.id);
      await writeAudit(tx, {
        action: "BOOKING_STATUS_CHANGED",
        entity: "Booking",
        entityId: booking.id,
        description: `Status alterado de ${booking.status} para ${nextStatus}.`,
        previousValues: { status: booking.status },
        newValues: {
          status: nextStatus,
          ...(nextStatus === "CANCELLED" ? { cancellationReason: cancellationReason?.success ? cancellationReason.data : "" } : {}),
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BookingOperationError) return fail(error.message, error.status);
    throw error;
  }
}
