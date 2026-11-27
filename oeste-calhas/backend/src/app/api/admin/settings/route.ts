import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { writeAudit } from "@/lib/admin/audit";
import { fail, sameOrigin } from "@/lib/security";

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(254).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(300).optional().nullable(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  theme: z.enum(["light", "dark"]),
  timezone: z.literal("America/Recife"),
  cancellationPolicy: z.string().trim().max(2000).optional().nullable(),
  bookingPolicy: z.string().trim().max(2000).optional().nullable(),
}).strict();

function normalize(value: z.infer<typeof settingsSchema>) {
  return {
    ...value,
    phone: value.phone?.trim() || null,
    email: value.email?.trim().toLowerCase() || null,
    address: value.address?.trim() || null,
    logoUrl: value.logoUrl?.trim() || null,
    cancellationPolicy: value.cancellationPolicy?.trim() || null,
    bookingPolicy: value.bookingPolicy?.trim() || null,
  };
}

export async function GET(req: Request) {
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  const settings = await db.companySettings.findUnique({ where: { id: 1 } });
  return NextResponse.json({
    settings: settings ?? {
      id: 1,
      name: "Oeste Calhas",
      phone: null,
      email: null,
      address: null,
      logoUrl: "/logo.png",
      theme: "light",
      timezone: "America/Recife",
      cancellationPolicy: null,
      bookingPolicy: null,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  let body: unknown;
  try { body = await req.json(); } catch { return fail("Requisição inválida.", 400); }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return fail("Confira os dados gerais da empresa.", 400);
  const data = normalize(parsed.data);

  const settings = await db.$transaction(async (tx) => {
    const previous = await tx.companySettings.findUnique({ where: { id: 1 } });
    const updated = await tx.companySettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    await writeAudit(tx, {
      action: "COMPANY_SETTINGS_UPDATED",
      entity: "CompanySettings",
      entityId: "1",
      description: "Configurações gerais da empresa atualizadas.",
      previousValues: previous ? {
        name: previous.name,
        phone: previous.phone,
        email: previous.email,
        address: previous.address,
        logoUrl: previous.logoUrl,
        theme: previous.theme,
        timezone: previous.timezone,
      } : undefined,
      newValues: {
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        address: updated.address,
        logoUrl: updated.logoUrl,
        theme: updated.theme,
        timezone: updated.timezone,
      },
    });
    return updated;
  });
  return NextResponse.json({ settings });
}
