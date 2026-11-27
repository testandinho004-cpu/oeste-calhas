import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { adminCustomerSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/admin/audit";
import { CustomerIdentityConflict, resolveCustomer } from "@/lib/admin/customerIdentity";
import { fail, sameOrigin } from "@/lib/security";

const pageNumber = (value: string | null, fallback: number, max: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback;
};

export async function GET(req: Request) {
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  const params = new URL(req.url).searchParams;
  const page = pageNumber(params.get("page"), 1, 1_000_000);
  const pageSize = pageNumber(params.get("pageSize"), 50, 100);
  const query = params.get("q")?.trim().slice(0, 100);
  const where: Prisma.CustomerWhereInput = query ? {
    OR: [
      { name: { contains: query } },
      { email: { contains: query } },
      { phone: { contains: query } },
    ],
  } : {};

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { bookings: true } },
        bookings: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
    db.customer.count({ where }),
  ]);
  const ids = customers.map((customer) => customer.id);
  const statusCounts = ids.length ? await db.booking.groupBy({
    by: ["customerId", "status"],
    where: { customerId: { in: ids } },
    _count: { _all: true },
  }) : [];

  const rows = customers.map((customer) => {
    const counts = statusCounts.filter((item) => item.customerId === customer.id);
    const countStatus = (status: string) => counts.find((item) => item.status === status)?._count._all ?? 0;
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      createdAt: customer.createdAt,
      lastActivity: customer.bookings[0]?.createdAt ?? customer.updatedAt,
      totalBookings: customer._count.bookings,
      completedBookings: countStatus("DONE"),
      cancelledBookings: countStatus("CANCELLED"),
      noShowBookings: countStatus("NO_SHOW"),
    };
  });

  return NextResponse.json({ customers: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  let body: unknown;
  try { body = await req.json(); } catch { return fail("Requisição inválida.", 400); }
  const parsed = adminCustomerSchema.safeParse(body);
  if (!parsed.success) return fail("Confira nome, telefone e e-mail do cliente.", 400);
  const data = parsed.data;

  try {
    const customer = await db.$transaction(async (tx) => {
      const email = data.email?.trim().toLowerCase() || null;
      const existing = await tx.customer.findFirst({
        where: { OR: [{ phone: data.phone }, ...(email ? [{ email }] : [])] },
      });
      const resolved = await resolveCustomer(tx, {
        name: data.name,
        email,
        phone: data.phone,
      });
      const updated = data.internalNotes !== undefined
        ? await tx.customer.update({ where: { id: resolved.id }, data: { internalNotes: data.internalNotes.trim() || null } })
        : resolved;
      await writeAudit(tx, {
        action: existing ? "CUSTOMER_UPDATED" : "CUSTOMER_CREATED",
        entity: "Customer",
        entityId: updated.id,
        description: existing ? "Cadastro de cliente atualizado pelo painel." : "Cliente cadastrado manualmente pelo painel.",
        newValues: { fields: ["name", "email", "phone", ...(data.internalNotes !== undefined ? ["internalNotes"] : [])] },
      });
      return updated;
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerIdentityConflict) return fail(error.message, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("O e-mail ou telefone já pertence a outro cliente.", 409);
    }
    throw error;
  }
}
