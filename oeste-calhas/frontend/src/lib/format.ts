export const TZ = "America/Recife";
export const STATUS_LABEL: Record<string, string> = { PENDING: "Aguardando confirmação", CONFIRMED: "Confirmado", IN_PROGRESS: "Em andamento", DONE: "Concluído", CANCELLED: "Cancelado", NO_SHOW: "Não compareceu" };
export const STATUS_HELP: Record<string, string> = {
  PENDING: "A equipe ainda vai confirmar esse horário com você.",
  CONFIRMED: "Horário confirmado pela equipe.",
  IN_PROGRESS: "O atendimento está acontecendo agora.",
  DONE: "Serviço concluído.",
  CANCELLED: "Esse agendamento foi cancelado e o horário liberado.",
  NO_SHOW: "A equipe registrou que ninguém foi encontrado no local.",
};
export const fmtTime = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const fmtDateLong = (s: string) => new Date(s).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
export const fmtShort = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
export const parts = (s: string) => ({
  day: new Date(s).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit" }),
  mon: new Date(s).toLocaleDateString("pt-BR", { timeZone: TZ, month: "short" }).replace(".", ""),
});
// "YYYY-MM-DD" -> rótulos (usa meio-dia UTC para nunca virar o dia)
export const keyLabel = (k: string, o: Intl.DateTimeFormatOptions) => new Date(`${k}T12:00:00Z`).toLocaleDateString("pt-BR", { ...o, timeZone: "UTC" });
export const todayKey = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
export const addDays = (k: string, n: number) => new Date(new Date(`${k}T12:00:00Z`).getTime() + n * 86400e3).toISOString().slice(0, 10);
