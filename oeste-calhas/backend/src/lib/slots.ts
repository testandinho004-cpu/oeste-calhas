export const OPEN_HOUR = 8;      // primeiro horário 08:00
export const CLOSE_HOUR = 17;    // último horário 16:00 (cada slot = 1h)
export const MIN_LEAD_HOURS = 12;
export const MAX_DAYS_AHEAD = 30;
export const MAX_ACTIVE_PER_USER = 3;      // agendamentos pendentes/confirmados futuros
export const MAX_CREATED_PER_24H = 5;
export const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

const pad = (n: number) => String(n).padStart(2, "0");
// Petrolina/Recife = UTC-3 fixo (sem horário de verão)
export const slotStart = (date: string, hour: number) => new Date(`${date}T${pad(hour)}:00:00-03:00`);
export const slotKey = (d: Date) => d.toISOString().slice(0, 13);

export function checkSlot(date: string, hour: number): string | null {
  const start = slotStart(date, hour);
  if (Number.isNaN(start.getTime())) return "Data inválida.";
  if (new Date(start.getTime() - 3 * 3600e3).getUTCDay() === 0) return "Não atendemos aos domingos.";
  const now = Date.now();
  if (start.getTime() < now + MIN_LEAD_HOURS * 3600e3) return `Agende com pelo menos ${MIN_LEAD_HOURS}h de antecedência.`;
  if (start.getTime() > now + MAX_DAYS_AHEAD * 86400e3) return `Só é possível agendar até ${MAX_DAYS_AHEAD} dias à frente.`;
  return null;
}
