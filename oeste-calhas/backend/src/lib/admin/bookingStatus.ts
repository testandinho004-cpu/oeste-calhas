export const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["DONE", "CANCELLED"],
  DONE: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionBooking(from: string, to: BookingStatus) {
  return BOOKING_STATUSES.includes(from as BookingStatus) && transitions[from as BookingStatus].includes(to);
}
