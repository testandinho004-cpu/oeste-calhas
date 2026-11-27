import type { Prisma } from "@prisma/client";
import { slotStart } from "@/lib/slots";

export type AvailabilityPeriod = { opensAt: string; closesAt: string };
export type BookingPolicyValues = {
  minimumLeadHours: number;
  maximumDaysAhead: number;
  cancellationCutoffHours: number;
};

const DEFAULT_POLICY: BookingPolicyValues = {
  minimumLeadHours: 12,
  maximumDaysAhead: 30,
  cancellationCutoffHours: 0,
};
const ACTIVE_STATUSES = ["PENDING", "CONFIRMED", "IN_PROGRESS"];

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

function minutes(value: string) {
  const match = /^([01]\d|2[0-3]):00$/.exec(value);
  return match ? Number(match[1]) * 60 : null;
}

export function businessDateKey(date: Date) {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function periodsFromHours(hours: number[]): AvailabilityPeriod[] {
  const sorted = [...new Set(hours)].sort((a, b) => a - b);
  const periods: AvailabilityPeriod[] = [];
  if (sorted.length === 0) return periods;
  let start = sorted[0];
  let previous = sorted[0];

  for (const hour of sorted.slice(1)) {
    if (hour === previous + 1) {
      previous = hour;
    } else {
      periods.push({ opensAt: `${String(start).padStart(2, "0")}:00`, closesAt: `${String(previous + 1).padStart(2, "0")}:00` });
      start = hour;
      previous = hour;
    }
  }
  periods.push({ opensAt: `${String(start).padStart(2, "0")}:00`, closesAt: `${String(previous + 1).padStart(2, "0")}:00` });
  return periods;
}

function fitsInPeriods(start: Date, durationMinutes: number, periods: AvailabilityPeriod[]) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Recife",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(start);
  const startMinutes = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60
    + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return periods.some((period) => {
    const opens = minutes(period.opensAt);
    const closes = minutes(period.closesAt);
    return opens !== null && closes !== null
      && startMinutes >= opens
      && startMinutes + durationMinutes <= closes;
  });
}

export async function findAffectedBookings(
  tx: Prisma.TransactionClient,
  dateKeys: string[],
  periodsByDate: Map<string, AvailabilityPeriod[]>,
) {
  if (dateKeys.length === 0) return [];
  const sortedDateKeys = [...dateKeys].sort();
  const dayStart = new Date(`${sortedDateKeys[0]}T00:00:00-03:00`);
  const dayEnd = new Date(`${sortedDateKeys[sortedDateKeys.length - 1]}T00:00:00-03:00`);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const bookings = await tx.booking.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      slotKey: { not: null },
      startsAt: { gte: dayStart, lt: dayEnd },
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, name: true, startsAt: true, durationMinutes: true },
  });
  return bookings.filter((booking) => {
    const periods = periodsByDate.get(businessDateKey(booking.startsAt)) ?? [];
    return !fitsInPeriods(booking.startsAt, booking.durationMinutes, periods);
  });
}

export async function getBookingPolicy(tx: Prisma.TransactionClient): Promise<BookingPolicyValues> {
  const policy = await tx.bookingPolicy.findUnique({ where: { id: 1 } });
  if (!policy) return DEFAULT_POLICY;
  return {
    minimumLeadHours: policy.minimumLeadHours,
    maximumDaysAhead: policy.maximumDaysAhead,
    cancellationCutoffHours: policy.cancellationCutoffHours,
  };
}

export async function getEffectivePeriods(
  tx: Prisma.TransactionClient,
  date: string,
): Promise<AvailabilityPeriod[]> {
  if (!isCalendarDate(date)) return [];
  const exception = await tx.availabilityException.findUnique({
    where: { dateKey: date },
    include: { periods: { orderBy: { opensAt: "asc" } } },
  });
  if (exception) {
    return exception.kind === "CUSTOM"
      ? exception.periods.map(({ opensAt, closesAt }) => ({ opensAt, closesAt }))
      : [];
  }
  return [];
}

function leadTimeError(start: Date, policy: BookingPolicyValues) {
  const now = Date.now();
  if (start.getTime() < now + policy.minimumLeadHours * 60 * 60 * 1000) {
    return `Agende com pelo menos ${policy.minimumLeadHours}h de antecedência.`;
  }
  return null;
}

export async function getSlotError(
  tx: Prisma.TransactionClient,
  date: string,
  hour: number,
  durationMinutes = 60,
  bufferMinutes = 0,
  ignoreBookingId?: string,
): Promise<string | null> {
  if (!isCalendarDate(date)) return "Data inválida.";
  if (!Number.isInteger(hour) || hour < 8 || hour > 16) return "Horário inválido.";
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 24 * 60) {
    return "Duração do atendimento inválida.";
  }

  if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 24 * 60) {
    return "Intervalo do atendimento inválido.";
  }
  const occupiedMinutes = durationMinutes + bufferMinutes;
  const start = slotStart(date, hour);
  const policy = await getBookingPolicy(tx);
  const leadError = leadTimeError(start, policy);
  if (leadError) return leadError;
  const periods = await getEffectivePeriods(tx, date);
  if (!fitsInPeriods(start, occupiedMinutes, periods)) {
    return "Esse horário não está disponível na agenda da empresa.";
  }

  const end = new Date(start.getTime() + occupiedMinutes * 60_000);
  const reservation = await tx.bookingReservation.findFirst({
    where: {
      resourceKey: "company",
      slotStart: { gte: start, lt: end },
      ...(ignoreBookingId ? { bookingId: { not: ignoreBookingId } } : {}),
    },
    select: { id: true },
  });
  if (reservation) return "Esse horário está ocupado. Escolha outro.";
  const possibleBookings = await tx.booking.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      slotKey: { not: null },
      startsAt: {
        gte: new Date(start.getTime() - 24 * 60 * 60_000),
        lt: end,
      },
      ...(ignoreBookingId ? { id: { not: ignoreBookingId } } : {}),
    },
    select: { startsAt: true, durationMinutes: true },
  });
  const overlaps = possibleBookings.some((booking) => {
    const existingEnd = booking.startsAt.getTime() + booking.durationMinutes * 60_000;
    return start.getTime() < existingEnd && booking.startsAt.getTime() < end.getTime();
  });
  return overlaps ? "Esse horário está ocupado. Escolha outro." : null;
}

export async function getAvailableHoursForDates(
  tx: Prisma.TransactionClient,
  dateKeys: string[],
  durationMinutes = 60,
  bufferMinutes = 0,
) {
  const dates = [...new Set(dateKeys)].filter(isCalendarDate).sort();
  if (dates.length === 0) return {};

  const policy = await getBookingPolicy(tx);
  const exceptions = await tx.availabilityException.findMany({
    where: { dateKey: { in: dates } },
    include: { periods: { orderBy: { opensAt: "asc" } } },
  });
  const periodsByDate = new Map(exceptions.map((exception) => [
    exception.dateKey,
    exception.kind === "CUSTOM"
      ? exception.periods.map(({ opensAt, closesAt }) => ({ opensAt, closesAt }))
      : [],
  ]));
  if (!dates.some((date) => (periodsByDate.get(date) ?? []).length > 0)) {
    return Object.fromEntries(dates.map((date) => [date, [] as number[]]));
  }
  const occupiedMinutes = durationMinutes + bufferMinutes;
  const rangeStart = slotStart(dates[0], 0);
  const rangeEnd = new Date(slotStart(dates[dates.length - 1], 0).getTime() + 24 * 60 * 60_000);
  const possibleBookings = await tx.booking.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      slotKey: { not: null },
      startsAt: { gte: new Date(rangeStart.getTime() - 24 * 60 * 60_000), lt: rangeEnd },
    },
    select: { startsAt: true, durationMinutes: true },
  });
  const reservations = await tx.bookingReservation.findMany({
    where: {
      resourceKey: "company",
      slotStart: { gte: rangeStart, lt: rangeEnd },
    },
    select: { slotStart: true },
  });

  return Object.fromEntries(dates.map((date) => {
    const periods = periodsByDate.get(date) ?? [];
    const dayStart = slotStart(date, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    const dateBookings = possibleBookings.filter((booking) => booking.startsAt >= new Date(dayStart.getTime() - 24 * 60 * 60_000) && booking.startsAt < dayEnd);
    const dateReservations = reservations.filter((reservation) => reservation.slotStart >= dayStart && reservation.slotStart < dayEnd);
    const hours: number[] = [];

    for (let hour = 8; hour <= 16; hour += 1) {
      const start = slotStart(date, hour);
      if (leadTimeError(start, policy) || !fitsInPeriods(start, occupiedMinutes, periods)) continue;
      const end = start.getTime() + occupiedMinutes * 60_000;
      const reserved = dateReservations.some((reservation) => reservation.slotStart.getTime() >= start.getTime() && reservation.slotStart.getTime() < end);
      if (reserved) continue;
      const overlaps = dateBookings.some((booking) => {
        const existingEnd = booking.startsAt.getTime() + booking.durationMinutes * 60_000;
        return start.getTime() < existingEnd && booking.startsAt.getTime() < end;
      });
      if (!overlaps) hours.push(hour);
    }

    return [date, hours];
  }));
}

export async function getAvailableHours(tx: Prisma.TransactionClient, date: string, durationMinutes = 60, bufferMinutes = 0) {
  if (!isCalendarDate(date)) return [];
  const availableByDate = await getAvailableHoursForDates(tx, [date], durationMinutes, bufferMinutes);
  return availableByDate[date] ?? [];
}

export async function reserveBookingSlots(
  tx: Prisma.TransactionClient,
  bookingId: string,
  startsAt: Date,
  durationMinutes: number,
  bufferMinutes = 0,
) {
  const occupiedMinutes = durationMinutes + bufferMinutes;
  for (let offset = 0; offset < occupiedMinutes; offset += 60) {
    await tx.bookingReservation.create({
      data: {
        bookingId,
        resourceKey: "company",
        slotStart: new Date(startsAt.getTime() + offset * 60_000),
      },
    });
  }
}

export async function releaseBookingSlots(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.bookingReservation.deleteMany({ where: { bookingId } });
}
