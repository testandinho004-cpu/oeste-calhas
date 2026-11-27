export function localDateString(date = new Date()) {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

export function getDateRange(fromValue?: string | null, toValue?: string | null) {
  const today = localDateString();
  const from = fromValue || today;
  const to = toValue || from;
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) return null;

  const start = new Date(`${from}T00:00:00-03:00`);
  const endExclusive = new Date(`${to}T00:00:00-03:00`);
  endExclusive.setTime(endExclusive.getTime() + 24 * 60 * 60 * 1000);
  return { from, to, start, endExclusive };
}
