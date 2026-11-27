import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminFromRequest } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import { fail, sameOrigin } from "@/lib/security";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  if (await adminFromRequest(req)) {
    await db.auditLog.create({
      data: {
        actor: "admin",
        action: "ADMIN_LOGOUT",
        entity: "AdminSession",
        description: "Logout administrativo realizado.",
      },
    });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
