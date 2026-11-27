import { NextRequest, NextResponse } from "next/server";

const MOBILE_UA = /Android.+Mobile|iPhone|iPod|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i;

/**
 * "/" entrega a versão desktop (app/page.tsx) ou a mobile (app/m/page.tsx) mantendo a mesma URL.
 * Dá para forçar com ?view=mobile ou ?view=desktop (fica guardado em cookie).
 */
export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const asked = url.searchParams.get("view");
  if (asked === "mobile" || asked === "desktop") {
    const back = url.clone();
    back.searchParams.delete("view");
    const res = NextResponse.redirect(back);
    res.cookies.set("oc-view", asked, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
    return res;
  }
  const pref = req.cookies.get("oc-view")?.value;
  const mobile = pref ? pref === "mobile" : MOBILE_UA.test(req.headers.get("user-agent") ?? "");
  if (!mobile) return NextResponse.next();
  const res = NextResponse.rewrite(new URL("/m", req.url));
  res.headers.set("Vary", "User-Agent, Cookie");
  return res;
}

export const config = { matcher: ["/"] };
