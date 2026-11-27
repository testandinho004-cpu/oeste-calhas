import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { adminBookingSchema } from "@/lib/validation";
import { BOOKING_STATUSES } from "@/lib/admin/bookingStatus";
import { writeAudit } from "@/lib/admin/audit";
import { resolveCustomer, CustomerIdentityConflict } from "@/lib/admin/customerIdentity";
import { getDateRange } from "@/lib/admin/query";
import { slotKey, slotStart } from "@/lib/slots";
import { getSlotError, reserveBookingSlots } from "@/lib/availability";
import { fail, sameOrigin } from "@/lib/security";

const integerParam = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

export async function GET(req: Request) {
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);

  const params = new URL(req.url).searchParams;
  const page = integerParam(params.get("page"), 1, 1, 1_000_000);
  const pageSize = integerParam(params.get("pageSize"), 50, 1, 100);
  const status = params.get("status");
  if (status && status !== "ALL" && !BOOKING_STATUSES.includes(status as (typeof BOOKING_STATUSES)[number])) {
    return fail("Status inválido.", 400);
  }

  const range = params.has("from") || params.has("to")
    ? getDateRange(params.get("from"), params.get("to"))
    : null;
  if ((params.has("from") || params.has("to")) && !range) return fail("Período inválido.", 400);

  const query = params.get("q")?.trim().slice(0, 100);
  const where: Prisma.BookingWhereInput = {
    ...(status && status !== "ALL" ? { status } : {}),
    ...(range ? { startsAt: { gte: range.start, lt: range.endExclusive } } : {}),
    ...(query ? {
      OR: [
        { id: { contains: query } },
        { name: { contains: query } },
        { phone: { contains: query } },
        { description: { contains: query } },
        { customer: { is: { email: { contains: query } } } },
      ],
    } : {}),
  };

  const [bookings, total] = await Promise.all([
    db.booking.findMany({
      where,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { email: true } },
        customer: { select: { id: true, email: true } },
      },
    }),
    db.booking.count({ where }),
  ]);
  return NextResponse.json({ bookings, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);

  let body: unknown;
  try { body = await req.json(); } catch { return fail("Requisição inválida.", 400); }
  const parsed = adminBookingSchema.safeParse(body);
  if (!parsed.success) return fail("Confira nome, telefone, data, horário, endereço e serviço.", 400);
  const data = parsed.data;
  if (data.website) return fail("Requisição inválida.", 400);

  const startsAt = slotStart(data.date, data.hour);

  try {
    const booking = await db.$transaction(async (tx) => {
      const durationMinutes = 60;
      const slotError = await getSlotError(tx, data.date, data.hour, durationMinutes, 0);
      if (slotError) throw new BookingSlotError(slotError);
      const email = data.email?.trim().toLowerCase() || null;
      const existingCustomer = await tx.customer.findFirst({
        where: { OR: [{ phone: data.phone }, ...(email ? [{ email }] : [])] },
        select: { id: true },
      });
      const customer = await resolveCustomer(tx, {
        name: data.name,
        email,
        phone: data.phone,
      });
      if (!existingCustomer) {
        await writeAudit(tx, {
          action: "CUSTOMER_CREATED",
          entity: "Customer",
          entityId: customer.id,
          description: "Perfil de cliente criado durante agendamento manual.",
          newValues: { fields: ["name", "email", "phone"] },
        });
      }
      const created = await tx.booking.create({
        data: {
          userId: customer.userId,
          customerId: customer.id,
          startsAt,
          slotKey: slotKey(startsAt),
          durationMinutes,
          name: data.name,
          phone: data.phone,
          address: data.address,
          description: data.description,
          status: "PENDING",
          source: "ADMIN",
        },
        include: { customer: { select: { id: true, email: true } } },
      });
      await reserveBookingSlots(tx, created.id, startsAt, created.durationMinutes, 0);
      await writeAudit(tx, {
        action: "BOOKING_CREATED",
        entity: "Booking",
        entityId: created.id,
        description: "Agendamento criado manualmente pelo painel.",
        newValues: { status: created.status, startsAt: created.startsAt.toISOString(), source: created.source },
      });
      return created;
    });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingSlotError) return fail(error.message, 409);
    if (error instanceof CustomerIdentityConflict) return fail(error.message, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Esse horário está ocupado ou os dados correspondem a clientes diferentes.", 409);
    }
    throw error;
  }
}

class BookingSlotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingSlotError";
  }
}
