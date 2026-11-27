"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { getCountryCallingCode } from "libphonenumber-js";
import Header, { ADMIN_THEME_KEY } from "@/components/Header";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import Tooltip from "@/components/ui/Tooltip";
import CountUp from "@/components/ui/CountUp";
import { useToast } from "@/components/ui/Toast";
import { IconCalendar, IconChart, IconChevron, IconChevronL, IconDots, IconDownload, IconGrid, IconList, IconLogout, IconPlus, IconRefresh, IconSearch, IconSliders, IconUsers, IconChat, IconClock } from "@/components/ui/Icons";
import AvailabilityCalendar from "@/components/admin/AvailabilityCalendar";
import { phoneCountries } from "@/lib/phoneCountries";

type Section = "overview" | "bookings" | "customers" | "availability" | "reports" | "audit" | "settings";
type AvailabilityPeriod = { opensAt: string; closesAt: string };
type AvailabilityException = { id: number; dateKey: string; kind: "BLOCK" | "CUSTOM"; reason: string | null; periods: AvailabilityPeriod[] };
type BookingPolicy = { minimumLeadHours: number; cancellationCutoffHours: number };
type Booking = {
  id: string;
  startsAt: string;
  createdAt?: string;
  status: string;
  name: string;
  phone: string;
  address: string;
  description: string;
  durationMinutes?: number;
  internalNotes?: string | null;
  cancellationReason?: string | null;
  user?: { email: string } | null;
  customer?: { id: string; email?: string | null } | null;
};
type Customer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  lastActivity: string;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
};
type AuditEntry = { id: number; actor: string; action: string; entity: string; entityId: string | null; description: string; result: string; createdAt: string };
type Overview = {
  metrics: Record<"totalAppointments" | "todayTotal" | "pending" | "confirmed" | "inProgress" | "done" | "cancelled" | "noShow" | "totalCustomers" | "newCustomers", number>;
  alerts: { pending: number; recentCancellations: { id: number; entityId: string | null; description: string; createdAt: string }[] };
  upcoming: Booking[];
};
type Report = {
  range: { from: string; to: string };
  metrics: { total: number; finalized: number; cancellationRate: number; completionRate: number; newCustomers: number; recurringCustomers: number; totalCustomers: number };
  statusDistribution: { status: string; label: string; count: number }[];
  busiestDay: [string, number] | null;
  busiestHour: [string, number] | null;
};
type CompanySettings = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoUrl: string | null;
  theme: "light" | "dark";
  timezone: string;
  cancellationPolicy: string | null;
  bookingPolicy: string | null;
};
type AdminDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  inputLabel?: string;
  onConfirm: (value: string) => void | Promise<void>;
};

const STATUS: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em andamento",
  DONE: "Finalizado",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};
const COUNTRIES = phoneCountries.map(({ code, name }) => [code, `${name} (+${getCountryCallingCode(code)})`] as const);

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error ?? "Falha na comunicação com o servidor."), { status: response.status, data: body });
  return body as T;
}

function localDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateKeyInBusinessTimezone(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function calendarRange(anchor: string, mode: "day" | "week" | "month") {
  const date = new Date(`${anchor}T12:00:00Z`);
  if (mode === "day") return { from: anchor, to: anchor };
  if (mode === "month") {
    return {
      from: `${anchor.slice(0, 7)}-01`,
      to: localDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12))),
    };
  }
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - mondayOffset, 12));
  return { from: localDate(monday), to: localDate(new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6, 12))) };
}

function calendarDays(anchor: string, mode: "day" | "week" | "month") {
  const range = calendarRange(anchor, mode);
  const start = new Date(`${range.from}T12:00:00Z`);
  const end = new Date(`${range.to}T12:00:00Z`);
  const days: string[] = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) days.push(localDate(date));
  if (mode !== "month") return days;
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(mondayOffset).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Recife", dateStyle: "short", timeStyle: "short" });
}

function hourInBusinessTimezone(value: string) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Recife", hour: "2-digit", hour12: false }).format(new Date(value)));
}

function periodsFromHours(hours: number[]): AvailabilityPeriod[] {
  const sorted = [...new Set(hours)].sort((a, b) => a - b);
  const periods: AvailabilityPeriod[] = [];
  for (const hour of sorted) {
    const previous = periods[periods.length - 1];
    if (previous && Number(previous.closesAt.slice(0, 2)) === hour) {
      previous.closesAt = `${String(hour + 1).padStart(2, "0")}:00`;
    } else {
      periods.push({ opensAt: `${String(hour).padStart(2, "0")}:00`, closesAt: `${String(hour + 1).padStart(2, "0")}:00` });
    }
  }
  return periods;
}

type IconCmp = (p: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
const NAV: { key: Section; label: string; icon: IconCmp; group: string }[] = [
  { key: "overview", label: "Visão geral", icon: IconGrid, group: "Gerenciamento" },
  { key: "bookings", label: "Agendamentos", icon: IconCalendar, group: "Gerenciamento" },
  { key: "customers", label: "Clientes", icon: IconUsers, group: "Gerenciamento" },
  { key: "availability", label: "Disponibilidade", icon: IconClock, group: "Gerenciamento" },
  { key: "reports", label: "Relatórios", icon: IconChart, group: "Sistema" },
  { key: "audit", label: "Logs de atividade", icon: IconList, group: "Sistema" },
  { key: "settings", label: "Configurações", icon: IconSliders, group: "Sistema" },
];
const TITLES: Record<Section, [string, string]> = {
  overview: ["Visão geral", "Resumo da operação no período escolhido."],
  bookings: ["Agendamentos", "Acompanhe, confirme e reorganize os atendimentos."],
  customers: ["Clientes", "Histórico e dados de quem já agendou."],
  availability: ["Disponibilidade", "Abra vagas por mês e ajuste horários por dia."],
  reports: ["Relatórios", "Indicadores para entender a demanda."],
  audit: ["Logs de atividade", "Tudo o que foi alterado no painel."],
  settings: ["Configurações", "Dados e aparência da empresa."],
};
function useLast<T>(v: T | null) { const r = useRef<T | null>(v); if (v) r.current = v; return v ?? r.current; }

function NavBtn({ active, icon: Icon, label, onClick, lid }: { active: boolean; icon: IconCmp; label: string; onClick: () => void; lid: string }) {
  return (
    <button className="nav" aria-current={active ? "page" : undefined} onClick={onClick}>
      {active && <motion.span layoutId={`pill-${lid}`} className="pill" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
      <Icon width={20} height={20} /><span>{label}</span>
    </button>
  );
}
function Segmented<T extends string>({ value, options, onChange, label, id }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string; id: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {value === k && <motion.span layoutId={`seg-${id}`} className="pill" transition={{ type: "spring", damping: 30, stiffness: 420 }} />}<span>{l}</span>
        </button>
      ))}
    </div>
  );
}
function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (n: number) => void }) {
  return <div className="pager"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}><IconChevronL width={16} height={16} /> Anterior</Button><span>Página {page} de {pages}</span><Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Próxima <IconChevron width={16} height={16} /></Button></div>;
}
function ListSkeleton({ rows = 5 }: { rows?: number }) { return <div className="stack" aria-busy="true" aria-label="Carregando">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={62} r={14} />)}</div>; }
function Empty({ icon: Icon, title, text }: { icon: IconCmp; title: string; text?: string }) { return <div className="empty card"><Icon width={34} height={34} /><h3>{title}</h3>{text && <p>{text}</p>}</div>; }
const fmtKey = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short" });

export default function AdminDashboard() {
  const toast = useToast();
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [from, setFrom] = useState(localDate());
  const [to, setTo] = useState(localDate());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingQuery, setBookingQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [bookingFrom, setBookingFrom] = useState("");
  const [bookingTo, setBookingTo] = useState("");
  const [bookingView, setBookingView] = useState<"list" | "calendar">("list");
  const [calendarMode, setCalendarMode] = useState<"day" | "week" | "month">("week");
  const [calendarDate, setCalendarDate] = useState(localDate());
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingPages, setBookingPages] = useState(1);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [customerPages, setCustomerPages] = useState(1);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditActor, setAuditActor] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditEntity, setAuditEntity] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [policy, setPolicy] = useState<BookingPolicy>({ minimumLeadHours: 12, cancellationCutoffHours: 0 });
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availabilityMonth, setAvailabilityMonth] = useState(localDate().slice(0, 7));
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityConfigured, setAvailabilityConfigured] = useState(false);
  const [availabilitySaveVersion, setAvailabilitySaveVersion] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<{ customer: Customer & { internalNotes?: string | null; bookings: Booking[] }; history: AuditEntry[] } | null>(null);
  const [bookingHistory, setBookingHistory] = useState<AuditEntry[]>([]);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [reportPreset, setReportPreset] = useState("30d");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [dialog, setDialog] = useState<AdminDialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [bkLoading, setBkLoading] = useState(true);
  const [cuLoading, setCuLoading] = useState(true);
  const [auLoading, setAuLoading] = useState(true);
  useEffect(() => { if (error) { toast.error(error); setError(""); } }, [error, toast]);

  function openDialog(nextDialog: AdminDialog) {
    setDialogValue("");
    setDialog(nextDialog);
  }

  function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    if (dialog.inputLabel && dialogValue.trim().length < 3) {
      setError("O motivo deve ter pelo menos 3 caracteres.");
      return;
    }
    const onConfirm = dialog.onConfirm;
    const value = dialogValue.trim();
    setDialog(null);
    setError("");
    void onConfirm(value);
  }

  const fail = useCallback((value: unknown) => {
    if (value && typeof value === "object" && "status" in value && value.status === 401) {
      router.replace("/admin/login");
      return;
    }
    setError(value instanceof Error ? value.message : "Ocorreu um erro inesperado.");
  }, [router]);

  const loadOverview = useCallback(async () => {
    try {
      const data = await request<Overview>(`/api/admin/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setOverview(data);
    } catch (cause) { fail(cause); }
  }, [fail, from, to]);

  const loadBookings = useCallback(async () => {
    setBkLoading(true);
    const params = new URLSearchParams({ page: String(bookingPage), pageSize: "20", status: statusFilter, q: bookingQuery });
    const range = bookingView === "calendar" ? calendarRange(calendarDate, calendarMode) : { from: bookingFrom, to: bookingTo };
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    try {
      const result = await request<{ bookings: Booking[]; totalPages: number }>(`/api/admin/bookings?${params}`);
      setBookings(result.bookings);
      setBookingPages(Math.max(1, result.totalPages));
    } catch (cause) { fail(cause); }
    finally { setBkLoading(false); }
  }, [bookingFrom, bookingPage, bookingQuery, bookingTo, bookingView, calendarDate, calendarMode, fail, statusFilter]);

  const loadCustomers = useCallback(async () => {
    setCuLoading(true);
    const params = new URLSearchParams({ page: String(customerPage), pageSize: "20", q: customerQuery });
    try {
      const result = await request<{ customers: Customer[]; totalPages: number }>(`/api/admin/customers?${params}`);
      setCustomers(result.customers);
      setCustomerPages(Math.max(1, result.totalPages));
    } catch (cause) { fail(cause); }
    finally { setCuLoading(false); }
  }, [customerPage, customerQuery, fail]);

  const loadAudit = useCallback(async () => {
    setAuLoading(true);
    const params = new URLSearchParams({ page: "1", pageSize: "50" });
    if (auditActor.trim()) params.set("actor", auditActor.trim());
    if (auditAction.trim()) params.set("action", auditAction.trim());
    if (auditEntity.trim()) params.set("entity", auditEntity.trim());
    if (auditFrom) params.set("from", auditFrom);
    if (auditTo) params.set("to", auditTo);
    try {
      const result = await request<{ logs: AuditEntry[] }>(`/api/admin/audit?${params}`);
      setAuditLogs(result.logs);
    } catch (cause) { fail(cause); }
    finally { setAuLoading(false); }
  }, [auditAction, auditActor, auditEntity, auditFrom, auditTo, fail]);

  const loadAvailability = useCallback(async () => {
    setAvailabilityLoading(true);
    const range = calendarRange(`${availabilityMonth}-01`, "month");
    const monthParams = new URLSearchParams({ from: range.from, to: range.to });
    const futureParams = new URLSearchParams({ from: localDate() });
    try {
      const [result, future, monthData] = await Promise.all([
        request<{ policy: BookingPolicy }>("/api/admin/availability"),
        request<{ exceptions: AvailabilityException[] }>(`/api/admin/availability/exceptions?${futureParams}`),
        request<{ exceptions: AvailabilityException[] }>(`/api/admin/availability/exceptions?${monthParams}`),
      ]);
      setPolicy(result.policy);
      setAvailabilityConfigured(future.exceptions.length > 0);
      setExceptions(monthData.exceptions);
    } catch (cause) { fail(cause); }
    finally { setAvailabilityLoading(false); }
  }, [availabilityMonth, fail]);

  const loadReport = useCallback(async () => {
    const params = new URLSearchParams({ preset: reportPreset });
    if (reportPreset === "custom") {
      if (!reportFrom || !reportTo) return setError("Informe o período inicial e final.");
      params.set("from", reportFrom);
      params.set("to", reportTo);
    }
    try {
      setReport(await request<Report>(`/api/admin/reports?${params}`));
    } catch (cause) { fail(cause); }
  }, [fail, reportFrom, reportPreset, reportTo]);

  const loadSettings = useCallback(async () => {
    try {
      const result = await request<{ settings: CompanySettings }>("/api/admin/settings");
      setSettings(result.settings);
    } catch (cause) { fail(cause); }
  }, [fail]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    setBusy(true);
    setError("");
    try {
      await request("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.name ?? "").trim(),
          phone: String(data.phone ?? "").trim() || null,
          email: String(data.email ?? "").trim() || null,
          address: String(data.address ?? "").trim() || null,
          logoUrl: String(data.logoUrl ?? "").trim() || null,
          theme: data.theme,
          timezone: "America/Recife",
          cancellationPolicy: String(data.cancellationPolicy ?? "").trim() || null,
          bookingPolicy: String(data.bookingPolicy ?? "").trim() || null,
        }),
      });
      const theme = data.theme === "dark" ? "dark" : "light";
      localStorage.setItem(ADMIN_THEME_KEY, theme);
      document.documentElement.dataset.theme = theme;
      await loadSettings();
      toast.success("Configurações salvas");
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { if (section === "bookings") void loadBookings(); }, [loadBookings, section]);
  useEffect(() => { if (section === "customers") void loadCustomers(); }, [loadCustomers, section]);
  useEffect(() => { if (section === "availability") void loadAvailability(); }, [loadAvailability, section]);
  useEffect(() => { if (section === "audit") void loadAudit(); }, [loadAudit, section]);
  useEffect(() => { if (section === "reports") void loadReport(); }, [loadReport, section]);
  useEffect(() => { if (section === "settings") void loadSettings(); }, [loadSettings, section]);

  const statusTotals = useMemo(() => {
    if (!overview) return [];
    return [["PENDING", overview.metrics.pending], ["CONFIRMED", overview.metrics.confirmed], ["IN_PROGRESS", overview.metrics.inProgress], ["DONE", overview.metrics.done], ["CANCELLED", overview.metrics.cancelled], ["NO_SHOW", overview.metrics.noShow]] as const;
  }, [overview]);
  const daysInCalendar = useMemo(() => calendarDays(calendarDate, calendarMode), [calendarDate, calendarMode]);
  const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

  function moveCalendar(direction: -1 | 1) {
    const date = new Date(`${calendarDate}T12:00:00Z`);
    const amount = calendarMode === "day" ? 1 : calendarMode === "week" ? 7 : 0;
    if (amount) date.setUTCDate(date.getUTCDate() + amount * direction);
    else {
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + direction);
    }
    setBookingPage(1);
    setCalendarDate(localDate(date));
  }

  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.replace("/admin/login");
    } catch (cause) { fail(cause); }
  }

  async function openBooking(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ booking: Booking; history: AuditEntry[] }>(`/api/admin/bookings/${id}`);
      setSelectedBooking(result.booking);
      setBookingHistory(result.history);
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  async function updateBooking(body: Record<string, unknown>, confirmation?: string) {
    if (!selectedBooking) return;
    if (confirmation) {
      openDialog({
        title: "Confirmar alteração",
        message: confirmation,
        confirmLabel: "Confirmar",
        onConfirm: () => updateBooking(body),
      });
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request(`/api/admin/bookings/${selectedBooking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSelectedBooking(null);
      await Promise.all([loadBookings(), loadOverview()]);
      toast.success("Agendamento atualizado");
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  async function changeStatus(status: string) {
    if (!selectedBooking) return;
    const label = STATUS[status] ?? status.toLowerCase();
    const isCancellation = status === "CANCELLED";
    openDialog({
      title: isCancellation ? "Cancelar agendamento" : "Confirmar alteração de status",
      message: isCancellation ? "Informe o motivo do cancelamento para continuar." : `Confirma ${label.toLowerCase()} este agendamento?`,
      confirmLabel: isCancellation ? "Confirmar cancelamento" : "Confirmar",
      danger: isCancellation,
      ...(isCancellation ? { inputLabel: "Motivo do cancelamento" } : {}),
      onConfirm: (reason) => updateBooking({ action: "status", status, ...(isCancellation ? { reason } : {}) }),
    });
  }

  async function viewCustomer(id: string) {
    setBusy(true);
    try {
      const result = await request<{ customer: Customer & { internalNotes?: string | null; bookings: Booking[] }; history: AuditEntry[] }>(`/api/admin/customers/${id}`);
      setSelectedCustomer(result);
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formElement = event.currentTarget;
    const payload: Record<string, unknown> = Object.fromEntries(new FormData(formElement).entries());
    payload.hour = Number(payload.hour);
    try {
      await request("/api/admin/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setShowBookingForm(false);
      formElement.reset();
      await Promise.all([loadBookings(), loadOverview()]);
      toast.success("Agendamento criado");
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formElement = event.currentTarget;
    const payload = Object.fromEntries(new FormData(formElement).entries());
    try {
      await request("/api/admin/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setShowCustomerForm(false);
      formElement.reset();
      await loadCustomers();
      toast.success("Cliente cadastrado");
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomer) return;
    setBusy(true);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await request(`/api/admin/customers/${selectedCustomer.customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setSelectedCustomer(null);
      await loadCustomers();
      toast.success("Cliente atualizado");
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  async function saveAvailabilityPolicy() {
    setAvailabilityBusy(true);
    setError("");
    try {
      await request("/api/admin/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      await loadAvailability();
      toast.success("Regras salvas");
    } catch (cause) {
      fail(cause);
    } finally { setAvailabilityBusy(false); }
  }

  async function saveMonthAvailability(month: string, closedDates: string[], acceptAffectedBookings = false) {
    setAvailabilityBusy(true);
    setError("");
    try {
      await request("/api/admin/availability/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          closedDates,
          ...(acceptAffectedBookings ? { acceptAffectedBookings: true } : {}),
        }),
      });
      setAvailabilityConfigured(true);
      await loadAvailability();
      setAvailabilitySaveVersion((version) => version + 1);
      toast.success("Vagas do mês abertas");
      return true;
    } catch (cause) {
      const payload = cause && typeof cause === "object" && "data" in cause
        ? cause.data as { affectedBookings?: { id: string; name: string; startsAt: string }[] }
        : null;
      if (!acceptAffectedBookings && payload?.affectedBookings?.length) {
        const affected = payload.affectedBookings;
        const details = affected.slice(0, 5).map((booking) => `${booking.name} — ${formatDate(booking.startsAt)}`).join("\n");
        const extra = affected.length > 5 ? `\nE mais ${affected.length - 5}.` : "";
        openDialog({
          title: "Agendamentos afetados",
          message: `${affected.length} agendamento(s) existente(s) seriam fechados por esta configuração:\n${details}${extra}\n\nEles não serão cancelados. Deseja abrir o mês mesmo assim?`,
          confirmLabel: "Abrir mês",
          danger: true,
          onConfirm: async () => { await saveMonthAvailability(month, closedDates, true); },
        });
        return false;
      }
      fail(cause);
      return false;
    } finally { setAvailabilityBusy(false); }
  }

  async function saveDateAvailability(dateKey: string, hours: number[], acceptAffectedBookings = false) {
    setAvailabilityBusy(true);
    setError("");
    const periods = periodsFromHours(hours);
    try {
      await request("/api/admin/availability/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateKey,
          kind: periods.length ? "CUSTOM" : "BLOCK",
          reason: "Horários ajustados pelo calendário.",
          periods,
          ...(acceptAffectedBookings ? { acceptAffectedBookings: true } : {}),
        }),
      });
      await loadAvailability();
      setAvailabilitySaveVersion((version) => version + 1);
      toast.success("Horários atualizados");
      return true;
    } catch (cause) {
      const payload = cause && typeof cause === "object" && "data" in cause
        ? cause.data as { affectedBookings?: { id: string; name: string; startsAt: string }[] }
        : null;
      if (!acceptAffectedBookings && payload?.affectedBookings?.length) {
        const affected = payload.affectedBookings;
        const details = affected.slice(0, 5).map((booking) => `${booking.name} — ${formatDate(booking.startsAt)}`).join("\n");
        const extra = affected.length > 5 ? `\nE mais ${affected.length - 5}.` : "";
        openDialog({
          title: "Agendamentos afetados",
          message: `${affected.length} agendamento(s) existente(s) seriam afetados:\n${details}${extra}\n\nEles não serão cancelados. Deseja salvar os horários mesmo assim?`,
          confirmLabel: "Salvar horários",
          danger: true,
          onConfirm: async () => { await saveDateAvailability(dateKey, hours, true); },
        });
        return false;
      }
      fail(cause);
      return false;
    } finally { setAvailabilityBusy(false); }
  }

  const today = localDate();
  const defaultBookingDate = today;
  const lastBooking = useLast(selectedBooking);
  const lastCustomer = useLast(selectedCustomer);
  const dlg = useLast(dialog);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const go = (s: Section) => { setSection(s); setMore(false); };
  async function refresh() {
    setRefreshing(true);
    await ({ overview: loadOverview, bookings: loadBookings, customers: loadCustomers, availability: loadAvailability, reports: loadReport, settings: loadSettings, audit: loadAudit } as Record<Section, () => Promise<void>>)[section]();
    setRefreshing(false);
  }
  const [title, subtitle] = TITLES[section];
  const sideGroups = ["Gerenciamento", "Sistema"];
  const b = lastBooking;
  const c = lastCustomer;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <>
      <Header admin>
        <Tooltip content="Atualizar dados" side="bottom"><Button variant="ghost" size="icon" aria-label="Atualizar dados" onClick={() => void refresh()} loading={refreshing}><IconRefresh /></Button></Tooltip>
        <Tooltip content="Sair do painel" side="bottom"><Button variant="ghost" size="icon" aria-label="Sair do painel" onClick={() => void logout()}><IconLogout /></Button></Tooltip>
      </Header>

      <div className="adm-shell">
        <aside className="adm-side" aria-label="Navegação administrativa">
          {sideGroups.map((g) => (<div key={g}><h4>{g}</h4>{NAV.filter((n) => n.group === g).map((n) => <NavBtn key={n.key} lid="side" active={section === n.key} icon={n.icon} label={n.label} onClick={() => go(n.key)} />)}</div>))}
        </aside>

        <main className="adm-main">
          <div className="adm-title"><div><h1>{title}</h1><p>{subtitle}</p></div></div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

              {section === "overview" && <>
                <div className="toolbar">
                  <Field label="De"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
                  <Field label="Até"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
                  <Button variant="green" onClick={() => void loadOverview()}>Aplicar período</Button>
                </div>
                <div className="kpis kpis-5">
                  {!overview ? Array.from({ length: 5 }, (_, i) => <div key={i} className="kpi"><Skeleton h={34} w={60} /><Skeleton h={14} w="80%" /></div>) : ([
                    ["Pendentes", overview.metrics.pending, true], ["Confirmados", overview.metrics.confirmed, false],
                    ["Em andamento", overview.metrics.inProgress, false], ["Serviços finalizados", overview.metrics.done, false],
                    ["Clientes cadastrados", overview.metrics.totalCustomers, false],
                  ] as [string, number, boolean][]).map(([l, v, hot], i) => (
                    <motion.div key={l} className={`kpi${hot && v > 0 ? " hot" : ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}><b><CountUp value={v} /></b><span>{l}</span></motion.div>
                  ))}
                </div>
                {overview && <>
                  <div className="panels">
                    <section className="card"><h2>Distribuição por status</h2>
                      <div className="bars">{statusTotals.map(([k, v]) => { const total = overview.metrics.totalAppointments || 1; return <div className="bar-row" key={k}><span>{STATUS[k]}</span><b>{v}</b><div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={v} aria-label={STATUS[k]}><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: v / total }} transition={{ duration: 0.7, ease: "easeOut" }} style={{ width: "100%" }} /></div></div>; })}</div>
                    </section>
                    <section className="card"><h2>Alertas operacionais</h2>
                      <p style={{ marginBottom: 12 }}><b className="big-num">{overview.alerts.pending}</b> <span className="muted">aguardando confirmação</span></p>
                      {overview.alerts.pending > 0 && <Button variant="soft" size="sm" onClick={() => { setStatusFilter("PENDING"); go("bookings"); }}>Revisar pendentes</Button>}
                      <h3 style={{ margin: "18px 0 8px", fontSize: "1rem" }}>Cancelamentos recentes</h3>
                      {overview.alerts.recentCancellations.length === 0 ? <p className="muted">Nenhum cancelamento recente.</p> : <ul className="timeline">{overview.alerts.recentCancellations.map((i) => <li key={i.id}>{i.description}<br /><small className="muted">{formatDate(i.createdAt)}</small></li>)}</ul>}
                    </section>
                  </div>
                  <div className="spread" style={{ marginBottom: 12 }}><h2 style={{ fontSize: "1.3rem" }}>Próximos atendimentos</h2><Button variant="ghost" size="sm" onClick={() => go("bookings")}>Ver todos</Button></div>
                  {overview.upcoming.length === 0 ? <Empty icon={IconCalendar} title="Nenhum atendimento próximo" /> : (
                    <div className="tablewrap"><table className="tbl"><thead><tr><th>Data e hora</th><th>Cliente</th><th>Descrição</th><th>Status</th><th></th></tr></thead><tbody>
                      {overview.upcoming.map((x) => <tr key={x.id}><td data-label="Quando">{formatDate(x.startsAt)}</td><td data-label="Cliente">{x.name}</td><td data-label="Serviço">{x.description}</td><td data-label="Status"><StatusBadge status={x.status} label={STATUS[x.status]} /></td><td data-label=""><Button variant="soft" size="sm" onClick={() => void openBooking(x.id)}>Detalhes</Button></td></tr>)}
                    </tbody></table></div>
                  )}
                </>}
              </>}

              {section === "bookings" && <>
                <div className="toolbar">
                  <div className="field grow"><span className="field-l">Buscar</span><div className="search"><IconSearch width={18} height={18} /><input value={bookingQuery} onChange={(e) => { setBookingPage(1); setBookingQuery(e.target.value); }} placeholder="Cliente, telefone, serviço ou ID" aria-label="Buscar agendamentos" /></div></div>
                  <Field label="Status"><select value={statusFilter} onChange={(e) => { setBookingPage(1); setStatusFilter(e.target.value); }}><option value="ALL">Todos</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                  {bookingView === "list" ? <>
                    <Field label="De"><input type="date" value={bookingFrom} onChange={(e) => { setBookingPage(1); setBookingFrom(e.target.value); }} /></Field>
                    <Field label="Até"><input type="date" value={bookingTo} onChange={(e) => { setBookingPage(1); setBookingTo(e.target.value); }} /></Field>
                  </> : <>
                    <Field label="Período"><select value={calendarMode} onChange={(e) => { setBookingPage(1); setCalendarMode(e.target.value as "day" | "week" | "month"); }}><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option></select></Field>
                    <Field label="Data"><input type="date" value={calendarDate} onChange={(e) => { setBookingPage(1); setCalendarDate(e.target.value); }} /></Field>
                  </>}
                </div>
                <div className="spread" style={{ marginBottom: 16 }}>
                  <Segmented id="view" label="Visualização" value={bookingView} options={[["list", "Lista"], ["calendar", "Calendário"]] as const} onChange={(v) => { setBookingPage(1); setBookingView(v); }} />
                  <Button onClick={() => setShowBookingForm(true)}><IconPlus width={18} height={18} /> Novo agendamento</Button>
                </div>

                {bookingView === "calendar" ? <>
                  <div className="cal-nav"><Button variant="ghost" size="sm" onClick={() => moveCalendar(-1)}><IconChevronL width={16} height={16} /> Anterior</Button><span>{fmtKey(calendarRange(calendarDate, calendarMode).from)} a {fmtKey(calendarRange(calendarDate, calendarMode).to)}</span><Button variant="ghost" size="sm" onClick={() => moveCalendar(1)}>Próximo <IconChevron width={16} height={16} /></Button></div>
                  {bkLoading && bookings.length === 0 ? <ListSkeleton rows={3} /> : <div className={`cal cal-${calendarMode}`}>
                    {daysInCalendar.map((day, i) => !day ? <div key={`e${i}`} className="cal-empty" aria-hidden="true" /> : (
                      <section key={day} className={`cal-cell${day === today ? " today" : ""}`}>
                        <h3>{new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "America/Recife", weekday: "short", day: "numeric", month: "short" })}</h3>
                        {bookings.filter((x) => dateKeyInBusinessTimezone(x.startsAt) === day).map((x) => (
                          <Tooltip key={x.id} content={`${x.description} · ${STATUS[x.status]}`}><button className={`ev ${x.status}`} onClick={() => void openBooking(x.id)}><b>{new Date(x.startsAt).toLocaleTimeString("pt-BR", { timeZone: "America/Recife", hour: "2-digit", minute: "2-digit" })} {x.name}</b><span>{x.description}</span></button></Tooltip>
                        ))}
                        {bookings.every((x) => dateKeyInBusinessTimezone(x.startsAt) !== day) && <small className="muted">Livre</small>}
                      </section>
                    ))}
                  </div>}
                </> : bkLoading && bookings.length === 0 ? <ListSkeleton /> : bookings.length === 0 ? <Empty icon={IconCalendar} title="Nenhum agendamento encontrado" text="Ajuste os filtros ou crie um novo agendamento." /> : (
                  <div className="tablewrap"><table className="tbl"><thead><tr><th>Data / hora</th><th>Cliente / contato</th><th>Serviço / endereço</th><th>Status</th><th>Ações</th></tr></thead><tbody>
                    {bookings.map((x) => <tr key={x.id}>
                      <td data-label="Quando">{formatDate(x.startsAt)}<br /><small>Criado: {formatDate(x.createdAt ?? x.startsAt)}</small></td>
                      <td data-label="Cliente">{x.name}<br /><a href={`https://wa.me/${x.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">{x.phone}</a><br /><small>{x.user?.email ?? x.customer?.email ?? "Cadastro manual"}</small></td>
                      <td data-label="Serviço"><b>{x.description}</b><br />{x.address}<br /><small>{x.durationMinutes ?? 60} min</small></td>
                      <td data-label="Status"><StatusBadge status={x.status} label={STATUS[x.status]} /></td>
                      <td data-label=""><Button variant="soft" size="sm" onClick={() => void openBooking(x.id)}>Detalhes</Button></td>
                    </tr>)}
                  </tbody></table></div>
                )}
                <Pager page={bookingPage} pages={bookingPages} onChange={setBookingPage} />
              </>}

              {section === "customers" && <>
                <div className="toolbar">
                  <div className="field grow"><span className="field-l">Buscar cliente</span><div className="search"><IconSearch width={18} height={18} /><input value={customerQuery} onChange={(e) => { setCustomerPage(1); setCustomerQuery(e.target.value); }} placeholder="Nome, telefone ou e-mail" aria-label="Buscar cliente" /></div></div>
                  <Button onClick={() => setShowCustomerForm(true)}><IconPlus width={18} height={18} /> Novo cliente</Button>
                </div>
                {cuLoading && customers.length === 0 ? <ListSkeleton /> : customers.length === 0 ? <Empty icon={IconUsers} title="Nenhum cliente encontrado" /> : (
                  <div className="tablewrap"><table className="tbl"><thead><tr><th>Cliente</th><th>Contato</th><th>Cadastro</th><th>Agend.</th><th>Finalizados</th><th>Cancelados</th><th>Faltas</th><th></th></tr></thead><tbody>
                    {customers.map((x) => <tr key={x.id}><td data-label="Cliente"><b>{x.name ?? "Sem nome"}</b></td><td data-label="Contato">{x.phone ?? "—"}<br /><small>{x.email ?? "—"}</small></td><td data-label="Cadastro">{formatDate(x.createdAt)}</td><td data-label="Agendamentos">{x.totalBookings}</td><td data-label="Finalizados">{x.completedBookings}</td><td data-label="Cancelados">{x.cancelledBookings}</td><td data-label="Faltas">{x.noShowBookings}</td><td data-label=""><Button variant="soft" size="sm" onClick={() => void viewCustomer(x.id)}>Perfil</Button></td></tr>)}
                  </tbody></table></div>
                )}
                <Pager page={customerPage} pages={customerPages} onChange={setCustomerPage} />
              </>}

              {section === "availability" && <div className="stack">
                <AvailabilityCalendar
                  month={availabilityMonth}
                  today={today}
                  exceptions={exceptions}
                  configured={exceptions.some((exception) => exception.dateKey >= today)}
                  hasConfiguredDates={availabilityConfigured}
                  loading={availabilityLoading}
                  busy={availabilityBusy}
                  saveVersion={availabilitySaveVersion}
                  onMonthChange={setAvailabilityMonth}
                  onSaveMonth={saveMonthAvailability}
                  onSaveDate={saveDateAvailability}
                />
                <form className="card" onSubmit={(e) => { e.preventDefault(); void saveAvailabilityPolicy(); }}>
                  <h2>Regras de agendamento</h2>
                  <div className="grid2">
                    <Field label="Antecedência mínima (horas)"><input type="number" min={0} max={720} value={policy.minimumLeadHours} onChange={(e) => setPolicy((p) => ({ ...p, minimumLeadHours: Number(e.target.value) }))} /></Field>
                    <Field label="Prazo mínimo para cancelar ou reagendar (horas)"><input type="number" min={0} max={720} value={policy.cancellationCutoffHours} onChange={(e) => setPolicy((p) => ({ ...p, cancellationCutoffHours: Number(e.target.value) }))} /></Field>
                  </div>
                  <Button type="submit" variant="green" loading={availabilityBusy}>Salvar regras</Button>
                </form>
              </div>}

              {section === "reports" && <>
                <div className="toolbar">
                  <Field label="Período"><select value={reportPreset} onChange={(e) => setReportPreset(e.target.value)}><option value="today">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="month">Mês atual</option><option value="previous-month">Mês anterior</option><option value="custom">Período personalizado</option></select></Field>
                  {reportPreset === "custom" && <><Field label="De"><input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></Field><Field label="Até"><input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></Field></>}
                  <Button variant="green" onClick={() => void loadReport()}>Aplicar</Button>
                  <a className="btn v-ghost" href={`/api/admin/reports?format=csv&preset=${encodeURIComponent(reportPreset)}${reportPreset === "custom" ? `&from=${encodeURIComponent(reportFrom)}&to=${encodeURIComponent(reportTo)}` : ""}`} target="_blank" rel="noreferrer"><IconDownload width={18} height={18} /> Exportar CSV</a>
                </div>
                {!report ? <div className="kpis">{Array.from({ length: 6 }, (_, i) => <div key={i} className="kpi"><Skeleton h={34} w={70} /><Skeleton h={14} w="80%" /></div>)}</div> : <>
                  <div className="kpis">
                    {([["Total de agendamentos", String(report.metrics.total)], ["Atendimentos finalizados", String(report.metrics.finalized)], ["Taxa de cancelamento", pct(report.metrics.cancellationRate)], ["Taxa de serviços finalizados", pct(report.metrics.completionRate)], ["Novos clientes", String(report.metrics.newCustomers)], ["Clientes recorrentes", String(report.metrics.recurringCustomers)]] as [string, string][]).map(([l, v], i) => <motion.div key={l} className="kpi" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}><b>{v}</b><span>{l}</span></motion.div>)}
                  </div>
                  <div className="panels">
                    <section className="card"><h2>Distribuição por status</h2>{report.statusDistribution.length === 0 ? <p className="muted">Sem dados no período.</p> : <div className="bars">{report.statusDistribution.map((x) => <div className="bar-row" key={x.status}><span>{x.label}</span><b>{x.count}</b><div className="bar"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: x.count / Math.max(report.metrics.total, 1) }} transition={{ duration: 0.7 }} style={{ width: "100%" }} /></div></div>)}</div>}</section>
                    <section className="card"><h2>Maior demanda</h2><dl className="dl"><dt>Dia</dt><dd>{report.busiestDay ? `${report.busiestDay[0]} (${report.busiestDay[1]} agendamento(s))` : "Sem dados"}</dd><dt>Horário</dt><dd>{report.busiestHour ? `${report.busiestHour[0]} (${report.busiestHour[1]} agendamento(s))` : "Sem dados"}</dd></dl></section>
                  </div>
                </>}
              </>}

              {section === "settings" && (!settings ? <ListSkeleton rows={4} /> : <form className="card" onSubmit={(e) => void saveSettings(e)}>
                <h2>Dados da empresa</h2>
                <div className="grid2">
                  <Field label="Nome da empresa"><input name="name" required minLength={2} maxLength={100} defaultValue={settings.name} /></Field>
                  <Field label="Telefone/WhatsApp"><input name="phone" maxLength={30} defaultValue={settings.phone ?? ""} /></Field>
                  <Field label="E-mail de contato"><input name="email" type="email" maxLength={254} defaultValue={settings.email ?? ""} /></Field>
                  <Field label="Endereço"><input name="address" maxLength={300} defaultValue={settings.address ?? ""} /></Field>
                  <Field label="URL da logo (opcional)"><input name="logoUrl" maxLength={500} defaultValue={settings.logoUrl ?? ""} placeholder="/logo.png" /></Field>
                  <Field label="Tema da interface"><select name="theme" defaultValue={settings.theme}><option value="light">Claro</option><option value="dark">Escuro</option></select></Field>
                </div>
                <Field label="Fuso horário"><select name="timezone" defaultValue={settings.timezone}><option value="America/Recife">America/Recife</option></select></Field>
                <Field label="Política de agendamento"><textarea name="bookingPolicy" maxLength={2000} defaultValue={settings.bookingPolicy ?? ""} placeholder="Antecedência, reagendamento e regras gerais." /></Field>
                <Field label="Política de cancelamento"><textarea name="cancellationPolicy" maxLength={2000} defaultValue={settings.cancellationPolicy ?? ""} placeholder="Prazos e condições para cancelamento." /></Field>
                <Button type="submit" variant="green" loading={busy}>Salvar configurações</Button>
              </form>)}

              {section === "audit" && <>
                <div className="toolbar">
                  <Field label="Responsável"><input value={auditActor} onChange={(e) => setAuditActor(e.target.value)} placeholder="ID ou admin" /></Field>
                  <Field label="Ação"><input value={auditAction} onChange={(e) => setAuditAction(e.target.value)} placeholder="Ex.: BOOKING_CREATED" /></Field>
                  <Field label="Entidade"><input value={auditEntity} onChange={(e) => setAuditEntity(e.target.value)} placeholder="Ex.: Booking" /></Field>
                  <Field label="De"><input type="date" value={auditFrom} onChange={(e) => setAuditFrom(e.target.value)} /></Field>
                  <Field label="Até"><input type="date" value={auditTo} onChange={(e) => setAuditTo(e.target.value)} /></Field>
                  <Button variant="green" onClick={() => void loadAudit()}>Filtrar</Button>
                </div>
                {auLoading && auditLogs.length === 0 ? <ListSkeleton /> : auditLogs.length === 0 ? <Empty icon={IconList} title="Nenhum registro encontrado" /> : (
                  <div className="tablewrap"><table className="tbl"><thead><tr><th>Data / hora</th><th>Responsável</th><th>Ação</th><th>Entidade</th><th>Descrição</th><th>Resultado</th></tr></thead><tbody>
                    {auditLogs.map((x) => <tr key={x.id}><td data-label="Quando">{formatDate(x.createdAt)}</td><td data-label="Responsável">{x.actor}</td><td data-label="Ação">{x.action}</td><td data-label="Entidade">{x.entity}{x.entityId ? ` · ${x.entityId}` : ""}</td><td data-label="Descrição">{x.description}</td><td data-label="Resultado">{x.result}</td></tr>)}
                  </tbody></table></div>
                )}
              </>}

            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav className="adm-tabs" aria-label="Navegação administrativa">
        {NAV.slice(0, 4).map((n) => <NavBtn key={n.key} lid="tab" active={section === n.key} icon={n.icon} label={n.label.split(" ")[0]} onClick={() => go(n.key)} />)}
        <NavBtn lid="tab" active={NAV.slice(4).some((n) => n.key === section)} icon={IconDots} label="Mais" onClick={() => setMore(true)} />
      </nav>

      <Modal open={more} onClose={() => setMore(false)} size="sm" title="Mais opções">
        <div className="stack">{NAV.slice(4).map((n) => <button key={n.key} className="btn v-soft" style={{ justifyContent: "flex-start" }} onClick={() => go(n.key)}><n.icon width={20} height={20} /> {n.label}</button>)}
          <Button variant="ghost" onClick={() => void logout()}><IconLogout width={18} height={18} /> Sair do painel</Button></div>
      </Modal>

      {/* Detalhe do agendamento */}
      <Modal open={!!selectedBooking} onClose={() => setSelectedBooking(null)} size="lg" title="Agendamento"
        footer={b ? <>
          {["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status) && <Button variant="danger" disabled={busy} onClick={() => void changeStatus("CANCELLED")}>Cancelar</Button>}
          {b.status === "CONFIRMED" && new Date(b.startsAt).getTime() <= Date.now() && <Button variant="ghost" disabled={busy} onClick={() => void changeStatus("NO_SHOW")}>Não compareceu</Button>}
          {b.status === "PENDING" && <Button variant="green" disabled={busy} onClick={() => void changeStatus("CONFIRMED")}>Confirmar</Button>}
          {b.status === "CONFIRMED" && <Button variant="green" disabled={busy} onClick={() => void changeStatus("IN_PROGRESS")}>Iniciar atendimento</Button>}
          {b.status === "IN_PROGRESS" && <Button variant="green" disabled={busy} onClick={() => void changeStatus("DONE")}>Finalizar atendimento</Button>}
        </> : undefined}>
        {b && <>
          <p style={{ marginBottom: 12 }}><StatusBadge status={b.status} label={STATUS[b.status]} /></p>
          <dl className="dl">
            <dt>Cliente</dt><dd>{b.name}</dd>
            <dt>Contato</dt><dd><a href={`https://wa.me/${b.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--green-text)", fontWeight: 700 }}><IconChat width={14} height={14} style={{ verticalAlign: "-2px" }} /> {b.phone}</a></dd>
            <dt>E-mail</dt><dd>{b.user?.email ?? b.customer?.email ?? "—"}</dd>
            <dt>Data</dt><dd>{formatDate(b.startsAt)}</dd>
            <dt>Endereço</dt><dd>{b.address}</dd>
            <dt>Serviço</dt><dd>{b.description}</dd>
            <dt>Identificador</dt><dd><small className="muted">{b.id}</small></dd>
            {b.cancellationReason && <><dt>Motivo do cancelamento</dt><dd>{b.cancellationReason}</dd></>}
          </dl>
          {["PENDING", "CONFIRMED"].includes(b.status) && <form onSubmit={(e) => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget).entries()); void updateBooking({ action: "edit", values }); }}>
            <h3>Editar informações</h3>
            <Field label="Nome"><input name="name" defaultValue={b.name} minLength={3} maxLength={80} pattern="[A-Za-z]+( [A-Za-z]+)*" /></Field>
            <Field label="Endereço"><input name="address" defaultValue={b.address} minLength={8} maxLength={200} /></Field>
            <Field label="Serviço / descrição"><textarea name="description" defaultValue={b.description} minLength={10} maxLength={600} /></Field>
            <Button type="submit" variant="soft" size="sm" disabled={busy}>Salvar edição</Button>
          </form>}
          {["PENDING", "CONFIRMED"].includes(b.status) && <form onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); void updateBooking({ action: "reschedule", date: d.get("date"), hour: Number(d.get("hour")) }, "Confirma o reagendamento?"); }}>
            <h3>Reagendar</h3>
            <div className="grid2">
              <Field label="Data"><input name="date" type="date" required min={defaultBookingDate} defaultValue={localDate(new Date(b.startsAt))} /></Field>
              <Field label="Horário"><select name="hour" defaultValue={String(hourInBusinessTimezone(b.startsAt))}>{Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></Field>
            </div>
            <Button type="submit" variant="soft" size="sm" disabled={busy}>Salvar horário</Button>
          </form>}
          <form onSubmit={(e) => { e.preventDefault(); void updateBooking({ action: "notes", internalNotes: new FormData(e.currentTarget).get("internalNotes") }); }}>
            <h3>Observações internas</h3>
            <Field label="Visíveis somente no painel"><textarea name="internalNotes" maxLength={2000} defaultValue={b.internalNotes ?? ""} /></Field>
            <Button type="submit" variant="soft" size="sm" disabled={busy}>Salvar observação</Button>
          </form>
          <h3>Histórico de alterações</h3>
          {bookingHistory.length === 0 ? <p className="muted">Sem alterações registradas.</p> : <ul className="timeline">{bookingHistory.map((x) => <li key={x.id}><b>{x.action}</b> {x.description}<br /><small className="muted">{formatDate(x.createdAt)}</small></li>)}</ul>}
        </>}
      </Modal>

      {/* Perfil do cliente */}
      <Modal open={!!selectedCustomer} onClose={() => setSelectedCustomer(null)} size="lg" title="Perfil do cliente"
        footer={<><Button variant="ghost" onClick={() => setSelectedCustomer(null)}>Fechar</Button><Button type="submit" form="customer-form" variant="green" loading={busy}>Salvar alterações</Button></>}>
        {c && <>
          <dl className="dl"><dt>Cadastro</dt><dd>{formatDate(c.customer.createdAt)}</dd><dt>Última atividade</dt><dd>{formatDate(c.customer.lastActivity)}</dd></dl>
          <form id="customer-form" onSubmit={(e) => void saveCustomer(e)}>
            <Field label="Nome"><input name="name" defaultValue={c.customer.name ?? ""} minLength={3} maxLength={80} pattern="[A-Za-z]+( [A-Za-z]+)*" /></Field>
            <Field label="E-mail"><input name="email" type="email" defaultValue={c.customer.email ?? ""} /></Field>
            <Field label="Observações internas"><textarea name="internalNotes" maxLength={2000} defaultValue={c.customer.internalNotes ?? ""} /></Field>
          </form>
          <h3>Histórico de agendamentos</h3>
          {c.customer.bookings.length === 0 ? <p className="muted">Sem agendamentos registrados.</p> : <ul className="timeline">{c.customer.bookings.map((x) => <li key={x.id}>{formatDate(x.startsAt)} <StatusBadge status={x.status} label={STATUS[x.status]} /><br /><small className="muted">{x.description}</small></li>)}</ul>}
          <h3>Alterações no cadastro</h3>
          {c.history.length === 0 ? <p className="muted">Sem alterações registradas.</p> : <ul className="timeline">{c.history.map((x) => <li key={x.id}><b>{x.action}</b> {x.description}<br /><small className="muted">{formatDate(x.createdAt)}</small></li>)}</ul>}
        </>}
      </Modal>

      {/* Novo agendamento */}
      <Modal open={showBookingForm} onClose={() => setShowBookingForm(false)} title="Criar agendamento"
        footer={<><Button variant="ghost" onClick={() => setShowBookingForm(false)}>Voltar</Button><Button type="submit" form="new-booking-form" variant="green" loading={busy}>Criar agendamento</Button></>}>
        <form id="new-booking-form" onSubmit={(e) => void createBooking(e)}>
          <Field label="Nome"><input name="name" required minLength={3} maxLength={80} pattern="[A-Za-z]+( [A-Za-z]+)*" /></Field>
          <Field label="E-mail (opcional)"><input name="email" type="email" /></Field>
          <div className="grid2">
            <Field label="País"><select name="country" required>{COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
            <Field label="Telefone (só números)"><input name="phone" required inputMode="numeric" pattern="[0-9]{5,15}" /></Field>
            <Field label="Data"><input name="date" type="date" required min={defaultBookingDate} defaultValue={defaultBookingDate} /></Field>
            <Field label="Horário"><select name="hour" required>{Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></Field>
          </div>
          <Field label="Endereço"><input name="address" required minLength={8} maxLength={200} /></Field>
          <Field label="Serviço / descrição"><textarea name="description" required minLength={10} maxLength={600} /></Field>
        </form>
      </Modal>

      {/* Novo cliente */}
      <Modal open={showCustomerForm} onClose={() => setShowCustomerForm(false)} title="Cadastrar cliente"
        footer={<><Button variant="ghost" onClick={() => setShowCustomerForm(false)}>Voltar</Button><Button type="submit" form="new-customer-form" variant="green" loading={busy}>Cadastrar cliente</Button></>}>
        <form id="new-customer-form" onSubmit={(e) => void createCustomer(e)}>
          <Field label="Nome"><input name="name" required minLength={3} maxLength={80} pattern="[A-Za-z]+( [A-Za-z]+)*" /></Field>
          <Field label="E-mail"><input name="email" type="email" /></Field>
          <div className="grid2">
            <Field label="País"><select name="country" required>{COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
            <Field label="Telefone (só números)"><input name="phone" required inputMode="numeric" pattern="[0-9]{5,15}" /></Field>
          </div>
          <Field label="Observações internas"><textarea name="internalNotes" maxLength={2000} /></Field>
        </form>
      </Modal>

      {/* Confirmação */}
      <Modal open={!!dialog} onClose={() => setDialog(null)} size="sm" title={dlg?.title ?? ""}
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Voltar</Button><Button type="submit" form="dialog-form" variant={dlg?.danger ? "dangerSolid" : "green"} disabled={Boolean(dlg?.inputLabel && dialogValue.trim().length < 3)}>{dlg?.confirmLabel}</Button></>}>
        <form id="dialog-form" onSubmit={submitDialog}>
          <p style={{ whiteSpace: "pre-line", marginBottom: 14 }}>{dlg?.message}</p>
          {dlg?.inputLabel && <Field label={dlg.inputLabel}><textarea data-autofocus required minLength={3} maxLength={500} value={dialogValue} onChange={(e) => setDialogValue(e.target.value)} /></Field>}
        </form>
      </Modal>
    </>
  );
}
