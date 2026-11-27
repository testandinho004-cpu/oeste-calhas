export function monthDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const offset = (firstDay + 6) % 7;
  const dates: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`),
  ];
  while (dates.length % 7 !== 0) dates.push(null);
  return dates;
}

export function shiftMonth(month: string, direction: -1 | 1) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + direction, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T12:00:00Z`));
}
