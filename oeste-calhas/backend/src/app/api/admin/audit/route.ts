import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { adminFromRequest } from "@/lib/adminAuth";
import { getDateRange } from "@/lib/admin/query";
import { fail } from "@/lib/security";

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(50);

export async function GET(req: Request) {
  if (!(await adminFromRequest(req))) return fail("Não autorizado.", 401);
  const params = new URL(req.url).searchParams;
  const page = pageSchema.safeParse(params.get("page") ?? undefined);
  const pageSize = pageSizeSchema.safeParse(params.get("pageSize") ?? undefined);
  if (!page.success || !pageSize.success) return fail("Paginação inválida.", 400);

  const range = params.has("from") || params.has("to")
    ? getDateRange(params.get("from"), params.get("to"))
    : null;
  if ((params.has("from") || params.has("to")) && !range) return fail("Intervalo de datas inválido.", 400);

  const where = {
    ...(params.get("actor") ? { actor: params.get("actor")! } : {}),
    ...(params.get("action") ? { action: params.get("action")! } : {}),
    ...(params.get("entity") ? { entity: params.get("entity")! } : {}),
    ...(range ? { createdAt: { gte: range.start, lt: range.endExclusive } } : {}),
  };
  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page.data - 1) * pageSize.data,
      take: pageSize.data,
    }),
  ]);
  return NextResponse.json({ logs, total, page: page.data, pageSize: pageSize.data }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
