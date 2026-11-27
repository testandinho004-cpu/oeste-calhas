import { describe, expect, it } from "vitest";
import { canTransitionBooking } from "./bookingStatus";

describe("transições de agendamento", () => {
  it("permite o fluxo principal", () => {
    expect(canTransitionBooking("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionBooking("IN_PROGRESS", "DONE")).toBe(true);
  });

  it("bloqueia transições inválidas", () => {
    expect(canTransitionBooking("DONE", "CANCELLED")).toBe(false);
    expect(canTransitionBooking("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("PENDING", "DONE")).toBe(false);
  });

  it("permite cancelamento e não comparecimento apenas nos estados previstos", () => {
    expect(canTransitionBooking("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "NO_SHOW")).toBe(true);
    expect(canTransitionBooking("IN_PROGRESS", "CANCELLED")).toBe(true);
  });
});
