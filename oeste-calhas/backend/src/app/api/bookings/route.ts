import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookingSchema } from "@/lib/validation";
import { MAX_ACTIVE_PER_USER, MAX_CREATED_PER_24H, slotKey, slotStart } from "@/lib/slots";
import { getSlotError, reserveBookingSlots } from "@/lib/availability";
import { clientIp, fail, rateLimit, sameOrigin, tooMany } from "@/lib/security";
import { writeAudit } from "@/lib/admin/audit";
import { CustomerIdentityConflict, resolveAuthenticatedCustomer } from "@/lib/admin/customerIdentity";

const uid = async () => ((await getServerSession(authOptions))?.user as { id?: string } | undefined)?.id;

// Lista SOMENTE os agendamentos do próprio usuário logado (filtro vem da sessão, nunca do cliente).
export async function GET(req: Request) {
  const id = await uid();
  if (!id) return fail("Faça login com o Google.", 401);
  const rl = rateLimit(`mine:${id}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const [bookings, customer, firstBooking] = await Promise.all([
    db.booking.findMany({
      where: { userId: id }, orderBy: { startsAt: "desc" }, take: 30,
      select: { id: true, startsAt: true, status: true, address: true, description: true },
    }),
    db.customer.findUnique({ where: { userId: id }, select: { name: true, phone: true } }),
    db.booking.findFirst({ where: { userId: id }, orderBy: { createdAt: "asc" }, select: { name: true, phone: true } }),
  ]);
  const profile = {
    name: customer?.name ?? firstBooking?.name ?? null,
    phone: customer?.phone ?? firstBooking?.phone ?? null,
  };
  return NextResponse.json({ bookings, profile }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  const ip = rateLimit(`book-ip:${clientIp(req)}`, 15, 10 * 60_000);
  if (!ip.ok) return tooMany(ip.retryAfter);
  const id = await uid();
  if (!id) return fail("Faça login com o Google para agendar.", 401);
  const u = rateLimit(`book-user:${id}`, 5, 10 * 60_000);
  if (!u.ok) return tooMany(u.retryAfter);

  let body: unknown;
  try { body = await req.json(); } catch { return fail("Requisição inválida.", 400); }
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    const messages: Record<string, string> = {
      date: "Informe uma data válida.",
      hour: "Escolha um horário válido.",
      name: "Informe o nome usando somente letras e espaços.",
      country: "Selecione um país válido.",
      phone: "Informe um telefone válido com o DDD, sem letras.",
      address: "Informe um endereço com pelo menos 8 caracteres.",
      description: "Descreva o serviço com pelo menos 10 caracteres.",
      website: "Campo inválido.",
    };
    return fail(messages[field] ?? "Confira os dados informados.", 400);
  }
  const d = parsed.data;
  if (d.website) return NextResponse.json({ ok: true }); // bot: finge sucesso, não grava nada

  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.blocked) return fail("Conta sem permissão para agendar. Fale conosco pelo WhatsApp.", 403);

  const [active, recent] = await Promise.all([
    db.booking.count({ where: { userId: id, status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gt: new Date() } } }),
    db.booking.count({ where: { userId: id, createdAt: { gt: new Date(Date.now() - 86400e3) } } }),
  ]);
  if (active >= MAX_ACTIVE_PER_USER) return fail(`Você já tem ${MAX_ACTIVE_PER_USER} agendamentos em aberto. Aguarde a conclusão de algum.`, 409);
  if (recent >= MAX_CREATED_PER_24H) return fail("Limite diário de solicitações atingido. Tente amanhã.", 429);

  const startsAt = slotStart(d.date, d.hour);
  let customerProfile: { name: string | null; phone: string | null } | null = null;
  try {
    await db.$transaction(async (tx) => {
      const durationMinutes = 60;
      const slotErrorForService = await getSlotError(tx, d.date, d.hour, durationMinutes, 0);
      if (slotErrorForService) throw new SlotAvailabilityError(slotErrorForService);
      const startsAt = slotStart(d.date, d.hour);
      const existingCustomer = await tx.customer.findFirst({
        where: { OR: [{ userId: id }, { email: user.email.toLowerCase() }, { phone: d.phone }] },
        select: { id: true },
      });
      const firstBooking = await tx.booking.findFirst({
        where: { userId: id },
        orderBy: { createdAt: "asc" },
        select: { name: true },
      });
      const customer = await resolveAuthenticatedCustomer(tx, {
        userId: id,
        email: user.email,
        name: firstBooking?.name ?? d.name,
        phone: d.phone,
      });
      customerProfile = { name: customer.name, phone: customer.phone };
      if (!existingCustomer) {
        await writeAudit(tx, {
          actor: id,
          action: "CUSTOMER_CREATED",
          entity: "Customer",
          entityId: customer.id,
          description: "Perfil de cliente criado durante o agendamento público.",
          newValues: { fields: ["name", "email", "phone"] },
        });
      }
      const booking = await tx.booking.create({
        data: {
          userId: id,
          customerId: customer.id,
          startsAt,
          slotKey: slotKey(startsAt),
          durationMinutes,
          name: customer.name ?? d.name,
          phone: customer.phone ?? d.phone,
          address: d.address,
          description: d.description,
          source: "PUBLIC",
        },
      });
      await reserveBookingSlots(tx, booking.id, startsAt, booking.durationMinutes, 0);
      await writeAudit(tx, {
        actor: id,
        action: "BOOKING_CREATED",
        entity: "Booking",
        entityId: booking.id,
        description: "Agendamento solicitado pelo cliente.",
        newValues: { status: booking.status, startsAt: startsAt.toISOString(), source: booking.source },
      });
    });
  } catch (e) {
    if (e instanceof SlotAvailabilityError) return fail(e.message, 409);
    if (e instanceof CustomerIdentityConflict) return fail(e.message, 409);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      if (String(e.meta?.target ?? "").toLowerCase().includes("phone")) {
        return fail("Esse telefone já está vinculado a outro cadastro.", 409);
      }
      return fail("Esse horário acabou de ser reservado. Escolha outro.", 409);
    }
    throw e;
  }
  return NextResponse.json({ ok: true, profile: customerProfile }, { status: 201 });
}
class SlotAvailabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotAvailabilityError";
  }
}
// Propositalmente NÃO existe DELETE/PATCH para clientes: só o admin altera ou cancela.
