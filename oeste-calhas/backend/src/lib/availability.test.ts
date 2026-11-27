import { describe, expect, it } from "vitest";
import { getAvailableHoursForDates, getSlotError, periodsFromHours } from "./availability";

function mockTx(options: {
  reserved?: boolean;
  existing?: boolean;
  periods?: { opensAt: string; closesAt: string }[] | null;
  exceptions?: { dateKey: string; kind: "BLOCK" | "CUSTOM"; periods: { opensAt: string; closesAt: string }[] }[];
} = {}) {
  return {
    bookingPolicy: {
      findUnique: async () => ({
        minimumLeadHours: 0,
        maximumDaysAhead: 1,
        cancellationCutoffHours: 0,
      }),
    },
    availabilityException: {
      findUnique: async () => options.periods === null
        ? null
        : { kind: "CUSTOM", periods: options.periods ?? [{ opensAt: "08:00", closesAt: "18:00" }] },
      findMany: async () => options.exceptions ?? [],
    },
    bookingReservation: {
      findFirst: async () => options.reserved ? { id: 1 } : null,
      findMany: async () => [],
    },
    booking: {
      findMany: async () => options.existing
        ? [{ startsAt: new Date("2030-01-10T13:00:00Z"), durationMinutes: 60 }]
        : [],
    },
  } as any;
}

describe("disponibilidade de horários", () => {
  it("aceita um horário livre dentro do período", async () => {
    const error = await getSlotError(mockTx(), "2030-01-10", 10);
    expect(error).toBeNull();
  });

  it("rejeita um horário reservado", async () => {
    const error = await getSlotError(mockTx({ reserved: true }), "2030-01-10", 10);
    expect(error).toContain("ocupado");
  });

  it("rejeita sobreposição com agendamento existente", async () => {
    const error = await getSlotError(mockTx({ existing: true }), "2030-01-10", 10);
    expect(error).toContain("ocupado");
  });

  it("mantém datas sem vagas configuradas indisponíveis", async () => {
    const error = await getSlotError(mockTx({ periods: null }), "2030-01-10", 10);
    expect(error).toContain("não está disponível");
  });

  it("rejeita data explicitamente fechada", async () => {
    const error = await getSlotError(mockTx({ periods: [] }), "2030-01-10", 10);
    expect(error).toContain("não está disponível");
  });

  it("rejeita horários fora da janela das 08:00 às 16:00", async () => {
    const error = await getSlotError(mockTx(), "2030-01-10", 17);
    expect(error).toBe("Horário inválido.");
  });

  it("permite datas abertas além do limite antigo de dias futuros", async () => {
    const error = await getSlotError(mockTx(), "2030-01-10", 10);
    expect(error).toBeNull();
  });

  it("converte horários selecionados em períodos contínuos", () => {
    expect(periodsFromHours([8, 9, 11, 16])).toEqual([
      { opensAt: "08:00", closesAt: "10:00" },
      { opensAt: "11:00", closesAt: "12:00" },
      { opensAt: "16:00", closesAt: "17:00" },
    ]);
  });

  it("retorna somente horários livres por data em uma consulta mensal", async () => {
    const days = await getAvailableHoursForDates(mockTx({
      exceptions: [{
        dateKey: "2030-01-10",
        kind: "CUSTOM",
        periods: [{ opensAt: "08:00", closesAt: "11:00" }],
      }],
    }), ["2030-01-10", "2030-01-11"]);

    expect(days).toEqual({ "2030-01-10": [8, 9, 10], "2030-01-11": [] });
  });
});
