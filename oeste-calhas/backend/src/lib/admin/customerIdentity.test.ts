import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { CustomerIdentityConflict, resolveAuthenticatedCustomer } from "./customerIdentity";

const existingCustomer = {
  id: "customer-1",
  userId: "user-1",
  email: "ana@example.com",
  name: "Ana Souza",
  phone: "+5581999999999",
};

function transaction(options: { customer?: typeof existingCustomer | null; phoneOwnerId?: string } = {}) {
  const customer = options.customer === undefined ? existingCustomer : options.customer;
  const phoneOwner = options.phoneOwnerId
    ? { id: options.phoneOwnerId, userId: null, email: null, name: null, phone: "+5581888888888" }
    : customer;
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...customer, ...data }));
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "customer-new", ...data }));
  const tx = {
    customer: {
      findMany: vi.fn(async () => customer ? [customer] : []),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; phone?: string } }) => {
        if (where.phone) return phoneOwner ? { id: phoneOwner.id } : null;
        if (where.id === phoneOwner?.id) return phoneOwner;
        return null;
      }),
      update,
      create,
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, update, create };
}

describe("identidade do cliente autenticado", () => {
  it("preserva o nome cadastrado e permite atualizar o telefone", async () => {
    const { tx, update } = transaction();
    const customer = await resolveAuthenticatedCustomer(tx, {
      userId: "user-1",
      email: "ana@example.com",
      name: "Outro Nome",
      phone: "+5581777777777",
    });

    expect(customer.name).toBe("Ana Souza");
    expect(customer.phone).toBe("+5581777777777");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Ana Souza", phone: "+5581777777777" }),
    }));
  });

  it("rejeita um telefone já vinculado a outro cliente", async () => {
    const { tx } = transaction({ phoneOwnerId: "customer-2" });
    await expect(resolveAuthenticatedCustomer(tx, {
      userId: "user-1",
      email: "ana@example.com",
      name: "Ana Souza",
      phone: "+5581777777777",
    })).rejects.toBeInstanceOf(CustomerIdentityConflict);
  });

  it("cria o perfil com o nome do primeiro agendamento", async () => {
    const { tx, create } = transaction({ customer: null });
    const customer = await resolveAuthenticatedCustomer(tx, {
      userId: "user-2",
      email: "bia@example.com",
      name: "Bia Souza",
      phone: "+5581666666666",
    });

    expect(customer.name).toBe("Bia Souza");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Bia Souza", phone: "+5581666666666" }),
    }));
  });
});
