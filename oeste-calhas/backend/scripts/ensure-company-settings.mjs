import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

try {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompanySettings" (
      "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
      "name" TEXT NOT NULL DEFAULT 'Oeste Calhas',
      "phone" TEXT,
      "email" TEXT,
      "address" TEXT,
      "logoUrl" TEXT,
      "primaryColor" TEXT NOT NULL DEFAULT '#193a2a',
      "theme" TEXT NOT NULL DEFAULT 'light',
      "timezone" TEXT NOT NULL DEFAULT 'America/Recife',
      "cancellationPolicy" TEXT,
      "bookingPolicy" TEXT,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const columns = await db.$queryRawUnsafe('PRAGMA table_info("CompanySettings")');
  if (!columns.some((column) => column.name === "theme")) {
    await db.$executeRawUnsafe('ALTER TABLE "CompanySettings" ADD COLUMN "theme" TEXT NOT NULL DEFAULT \'light\'');
  }
  await db.$executeRawUnsafe(`
    INSERT OR IGNORE INTO "CompanySettings"
      ("id", "name", "phone", "email", "address", "logoUrl", "primaryColor", "timezone", "cancellationPolicy", "bookingPolicy", "updatedAt")
    VALUES
      (1, 'Oeste Calhas', NULL, NULL, NULL, '/logo.png', '#193a2a', 'America/Recife', NULL, NULL, CURRENT_TIMESTAMP)
  `);
  console.log("CompanySettings table ready");
} finally {
  await db.$disconnect();
}
