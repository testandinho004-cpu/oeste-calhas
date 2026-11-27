import { PrismaClient, Prisma } from "@prisma/client";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient();

async function main() {
  const users = await db.user.findMany({
    include: { bookings: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  let linkedBookings = 0;

  for (const user of users) {
    await db.$transaction(async (tx) => {
      const latestBooking = user.bookings[0];
      const parsedPhone = latestBooking
        ? parsePhoneNumberFromString(latestBooking.phone, "BR")
        : undefined;
      const phone = parsedPhone?.isValid() ? parsedPhone.number : null;

      let customer = await tx.customer.findUnique({ where: { userId: user.id } });
      if (!customer) customer = await tx.customer.findUnique({ where: { email: user.email } });
      if (!customer && phone) {
        const phoneMatch = await tx.customer.findUnique({ where: { phone } });
        if (phoneMatch && !phoneMatch.userId && (!phoneMatch.email || phoneMatch.email === user.email)) {
          customer = phoneMatch;
        }
      }

      if (customer) {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            userId: customer.userId ?? user.id,
            email: customer.email ?? user.email,
            name: customer.name ?? latestBooking?.name ?? user.name,
            phone: customer.phone ?? phone ?? undefined,
          },
        });
      } else {
        let safePhone = phone;
        if (safePhone && await tx.customer.findUnique({ where: { phone: safePhone } })) safePhone = null;
        customer = await tx.customer.create({
          data: {
            userId: user.id,
            email: user.email,
            name: latestBooking?.name ?? user.name,
            phone: safePhone,
          },
        });
      }

      const result = await tx.booking.updateMany({
        where: { userId: user.id, customerId: null },
        data: { customerId: customer.id },
      });
      linkedBookings += result.count;
    });
  }

  console.log(`Clientes vinculados: ${users.length}; agendamentos preservados e associados: ${linkedBookings}.`);
}

main()
  .catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`Falha ao migrar clientes: ${error.code}`);
    } else {
      console.error("Falha ao migrar clientes.");
    }
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
