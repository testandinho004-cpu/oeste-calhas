import { SignJWT, jwtVerify } from "jose";

export const ADMIN_COOKIE = "oc_admin";
const secret = () => new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET ?? "");

export async function signAdminToken() {
  return new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(secret());
}
export async function verifyAdminToken(token?: string) {
  if (!token || !process.env.ADMIN_SESSION_SECRET) return false;
  try { await jwtVerify(token, secret(), { algorithms: ["HS256"] }); return true; } catch { return false; }
}
export const adminFromRequest = (req: Request) => {
  const m = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${ADMIN_COOKIE}=([^;]+)`));
  return verifyAdminToken(m?.[1]);
};
