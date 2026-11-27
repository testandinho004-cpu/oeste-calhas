import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ADMIN_COOKIE, signAdminToken } from "@/lib/adminAuth";
import { clientIp, fail, rateLimit, sameOrigin, tooMany } from "@/lib/security";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  const ip = clientIp(req);
  // 6 dígitos = 1 milhão de combinações: limites bem agressivos por IP e globais.
  const a = rateLimit(`adm-ip:${ip}`, 5, 15 * 60_000);
  if (!a.ok) return tooMany(a.retryAfter);
  const g = rateLimit("adm-global", 30, 60 * 60_000);
  if (!g.ok) return tooMany(g.retryAfter);

  let pin = "";
  try { pin = String((await req.json()).pin ?? ""); } catch { /* vazio */ }
  const hash = process.env.ADMIN_PIN_HASH;
  const ok = /^\d{6}$/.test(pin) && !!hash && (await bcrypt.compare(pin, hash));
  if (!ok) {
    await db.auditLog.create({
      data: {
        actor: "anonymous",
        action: "ADMIN_LOGIN_FAILED",
        entity: "AdminSession",
        description: "Tentativa de login administrativo recusada.",
        result: "FAILURE",
      },
    });
    await new Promise((r) => setTimeout(r, 700));
    return fail("PIN incorreto.", 401);
  }

  await db.auditLog.create({
    data: {
      actor: "admin",
      action: "ADMIN_LOGIN",
      entity: "AdminSession",
      description: "Login administrativo realizado.",
    },
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, await signAdminToken(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 2 * 3600,
  });
  return res;
}
