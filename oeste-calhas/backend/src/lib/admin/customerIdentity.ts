import type { Customer, Prisma } from "@prisma/client";

export class CustomerIdentityConflict extends Error {
  constructor(message = "Os dados informados correspondem a clientes diferentes.") {
    super(message);
    this.name = "CustomerIdentityConflict";
  }
}

type CustomerInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  userId?: string;
};

type AuthenticatedCustomerInput = CustomerInput & { userId: string; email: string };

export async function resolveCustomer(tx: Prisma.TransactionClient, input: CustomerInput): Promise<Customer> {
  const email = input.email?.trim().toLowerCase() || null;
  const conditions: Prisma.CustomerWhereInput[] = [];
  if (input.userId) conditions.push({ userId: input.userId });
  if (email) conditions.push({ email });
  if (input.phone) conditions.push({ phone: input.phone });

  const matches = conditions.length
    ? await tx.customer.findMany({ where: { OR: conditions }, take: 3 })
    : [];
  const matchIds = new Set(matches.map((customer) => customer.id));
  if (matchIds.size > 1) throw new CustomerIdentityConflict();

  const match = matches[0];
  if (match) {
    if (input.userId && match.userId && match.userId !== input.userId) throw new CustomerIdentityConflict();
    return tx.customer.update({
      where: { id: match.id },
      data: {
        name: input.name ?? match.name,
        email: email ?? match.email,
        phone: input.phone ?? match.phone,
        userId: input.userId ?? match.userId,
      },
    });
  }

  return tx.customer.create({
    data: { name: input.name, email, phone: input.phone, userId: input.userId },
  });
}

export async function resolveAuthenticatedCustomer(
  tx: Prisma.TransactionClient,
  input: AuthenticatedCustomerInput,
): Promise<Customer> {
  const email = input.email.trim().toLowerCase();
  const matches = await tx.customer.findMany({
    where: { OR: [{ userId: input.userId }, { email }] },
    take: 3,
  });
  if (new Set(matches.map((customer) => customer.id)).size > 1) throw new CustomerIdentityConflict();

  const match = matches[0];
  const phoneOwner = input.phone
    ? await tx.customer.findUnique({ where: { phone: input.phone }, select: { id: true } })
    : null;

  if (match) {
    if (match.userId && match.userId !== input.userId) throw new CustomerIdentityConflict();
    if (phoneOwner && phoneOwner.id !== match.id) {
      throw new CustomerIdentityConflict("Esse telefone já está vinculado a outro cadastro.");
    }
    return tx.customer.update({
      where: { id: match.id },
      data: {
        userId: input.userId,
        email,
        name: match.name ?? input.name,
        phone: input.phone ?? match.phone,
      },
    });
  }

  if (phoneOwner) {
    const phoneMatch = await tx.customer.findUnique({ where: { id: phoneOwner.id } });
    if (!phoneMatch || (phoneMatch.userId && phoneMatch.userId !== input.userId) || (phoneMatch.email && phoneMatch.email !== email)) {
      throw new CustomerIdentityConflict("Esse telefone já está vinculado a outro cadastro.");
    }
    if (!phoneMatch.userId) {
      return tx.customer.update({
        where: { id: phoneMatch.id },
        data: { userId: input.userId, email, name: phoneMatch.name ?? input.name },
      });
    }
  }

  return tx.customer.create({ data: { userId: input.userId, email, name: input.name, phone: input.phone } });
}
