import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await db.companySettings.findUnique({
    where: { id: 1 },
    select: { name: true, phone: true, email: true, address: true, logoUrl: true, primaryColor: true, theme: true },
  });
  return NextResponse.json({
    settings: settings ?? {
      name: "Oeste Calhas",
      phone: null,
      email: null,
      address: null,
      logoUrl: "/logo.png",
      primaryColor: "#193a2a",
      theme: "light",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
