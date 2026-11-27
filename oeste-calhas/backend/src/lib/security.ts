import { NextResponse } from "next/server";

type Hit = number[];
const store = new Map<string, Hit>();

/** Janela deslizante em memória. Em produção com várias instâncias/serverless, troque por Redis (Upstash). */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    store.set(key, hits);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000)) };
  }
  hits.push(now);
  store.set(key, hits);
  if (store.size > 20000) for (const [k, v] of store) if (!v.some((t) => now - t < windowMs)) store.delete(k);
  return { ok: true, retryAfter: 0 };
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Anti-CSRF: requisições que alteram dados só valem se o Origin for o próprio site. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const allowedOrigin = process.env.FRONTEND_URL?.replace(/\/$/, "");
    if (allowedOrigin) return origin === allowedOrigin;
    return new URL(origin).host === req.headers.get("host");
  } catch { return false; }
}

export const fail = (error: string, status: number, headers?: Record<string, string>) =>
  NextResponse.json({ error }, { status, headers });

export const tooMany = (retryAfter: number) =>
  fail("Muitas tentativas. Aguarde um pouco e tente de novo.", 429, { "Retry-After": String(retryAfter) });
