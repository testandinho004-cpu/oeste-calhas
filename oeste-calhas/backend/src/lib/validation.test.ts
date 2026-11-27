import { describe, expect, it } from "vitest";
import { bookingInputSchema, bookingSchema, adminCustomerSchema } from "./validation";

const valid = {
  date: "2030-01-10",
  hour: 10,
  name: "Maria Silva",
  country: "BR",
  phone: "81999999999",
  address: "Rua das Flores 123 Recife",
  description: "Troca completa de calha na lateral",
};

describe("validação de agendamento", () => {
  it("aceita nome e telefone válidos", () => {
    expect(bookingInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejeita nome com números ou acentos", () => {
    expect(bookingInputSchema.safeParse({ ...valid, name: "Maria123" }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...valid, name: "José Silva" }).success).toBe(false);
  });

  it("rejeita telefone com letras", () => {
    expect(bookingInputSchema.safeParse({ ...valid, phone: "81999ABC999" }).success).toBe(false);
  });

  it("aceita países americanos e rejeita números sem formato válido", () => {
    expect(bookingInputSchema.safeParse({ ...valid, country: "BZ" }).success).toBe(true);
    expect(bookingSchema.safeParse({ ...valid, phone: "12345" }).success).toBe(false);
  });

  it("rejeita endereço curto e descrição curta", () => {
    expect(bookingInputSchema.safeParse({ ...valid, address: "Rua" }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...valid, description: "Troca" }).success).toBe(false);
  });

  it("rejeita horário fora da faixa permitida", () => {
    expect(bookingInputSchema.safeParse({ ...valid, hour: 24 }).success).toBe(false);
  });

  it("valida cadastro administrativo", () => {
    expect(adminCustomerSchema.safeParse({
      name: "Ana Souza",
      country: "BR",
      phone: "81988887777",
      email: "ana@example.com",
    }).success).toBe(true);
  });
});
