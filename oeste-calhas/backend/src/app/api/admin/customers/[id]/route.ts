import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { bookingInputSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/admin/audit";
import { fail, sameOrigin } from "@/lib/security";

const updateSchema = z.object({
  name: bookingInputSchema.shape.name.optional(),
  email: z.string().email().max(254).optional().or(z.literal("")),
  country: bookingInputSchema.shape.country.optional(),
  phone: z.string().regex(/^\d{5,15}$/).optional(),
  internalNotes: z.string().max(2000).optional(),
}).strict();

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  const customer = await db.customer.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { email: true, blocked: true } },
      bookings: {
        orderBy: { startsAt: "desc" },
      },
    },
  });
  if (!customer) return fail("Cliente não encontrado.", 404);
  const history = await db.auditLog.findMany({
    where: { entity: "Customer", entityId: params.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ customer, history }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  let body: unknown;
  try { body = await req.json(); } catch { return fail("Requisição inválida.", 400); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return fail("Dados inválidos.", 400);
  const data = parsed.data;

  try {
    const customer = await db.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({ where: { id: params.id } });
      if (!current) return null;
      const email = data.email === undefined ? current.email : data.email.trim().toLowerCase() || null;
      if (current.userId && email !== current.email) {
        throw new CustomerUpdateError("O e-mail de uma conta Google vinculada não pode ser alterado pelo painel.", 409);
      }
      let phone: string | undefined;
      if (data.phone !== undefined) {
        if (!data.country) throw new CustomerUpdateError("Selecione o país do telefone.", 400);
        const parsedPhone = parsePhoneNumberFromString(data.phone, data.country as CountryCode);
        if (!parsedPhone?.isValid()) throw new CustomerUpdateError("Número de telefone inválido.", 400);
        phone = parsedPhone.number;
      }
      const updated = await tx.customer.update({
        where: { id: current.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.email !== undefined ? { email } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(data.internalNotes !== undefined ? { internalNotes: data.internalNotes.trim() || null } : {}),
        },
      });
      await writeAudit(tx, {
        action: "CUSTOMER_UPDATED",
        entity: "Customer",
        entityId: current.id,
        description: "Cadastro do cliente editado pelo painel.",
        newValues: { fields: Object.keys(data).filter((field) => field !== "country") },
      });
      return updated;
    });
    if (!customer) return fail("Cliente não encontrado.", 404);
    return NextResponse.json({ customer });
  } catch (error) {
    if (error instanceof CustomerUpdateError) return fail(error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("O e-mail ou telefone já pertence a outro cliente.", 409);
    }
    throw error;
  }
}

class CustomerUpdateError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CustomerUpdateError";
  }
}
