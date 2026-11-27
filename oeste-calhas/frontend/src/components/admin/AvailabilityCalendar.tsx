"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { IconChevron, IconChevronL, IconClock, IconPlus } from "@/components/ui/Icons";
import { monthDates, monthLabel, shiftMonth } from "@/lib/calendar";

type AvailabilityPeriod = { opensAt: string; closesAt: string };
type AvailabilityException = {
  id: number;
  dateKey: string;
  kind: "BLOCK" | "CUSTOM";
  reason: string | null;
  periods: AvailabilityPeriod[];
};
type Props = {
  month: string;
  today: string;
  exceptions: AvailabilityException[];
  configured: boolean;
  hasConfiguredDates: boolean;
  loading: boolean;
  busy: boolean;
  saveVersion: number;
  onMonthChange: (month: string) => void;
  onSaveMonth: (month: string, closedDates: string[], acceptAffectedBookings: boolean) => Promise<boolean>;
  onSaveDate: (dateKey: string, hours: number[], acceptAffectedBookings: boolean) => Promise<boolean>;
};

const HOURS = Array.from({ length: 9 }, (_, index) => index + 8);
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function hoursForPeriods(periods: AvailabilityPeriod[]) {
  return HOURS.filter((hour) => periods.some((period) => {
    const opens = Number(period.opensAt.slice(0, 2));
    const closes = Number(period.closesAt.slice(0, 2));
    return hour >= opens && hour + 1 <= closes;
  }));
}

export default function AvailabilityCalendar({
  month,
  today,
  exceptions,
  configured,
  hasConfiguredDates,
  loading,
  busy,
  saveVersion,
  onMonthChange,
  onSaveMonth,
  onSaveDate,
}: Props) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [editingDate, setEditingDate] = useState("");
  const [editingHours, setEditingHours] = useState<number[]>([]);
  const days = useMemo(() => monthDates(month), [month]);
  const exceptionByDate = useMemo(() => new Map(exceptions.map((exception) => [exception.dateKey, exception])), [exceptions]);
  const selectedException = exceptionByDate.get(editingDate);
  const selectedMonthIsPast = month < today.slice(0, 7);
  const previousMonthDisabled = month <= today.slice(0, 7);

  useEffect(() => {
    if (saveVersion > 0) {
      setSetupOpen(false);
      setClosedDates([]);
      setEditingDate("");
    }
  }, [saveVersion]);

  function navigateMonth(direction: -1 | 1) {
    onMonthChange(shiftMonth(month, direction));
    setClosedDates([]);
  }

  function toggleDate(dateKey: string) {
    setClosedDates((current) => current.includes(dateKey)
      ? current.filter((date) => date !== dateKey)
      : [...current, dateKey]);
  }

  function openDate(dateKey: string) {
    const exception = exceptionByDate.get(dateKey);
    setEditingDate(dateKey);
    setEditingHours(exception?.kind === "CUSTOM" ? hoursForPeriods(exception.periods) : []);
  }

  async function saveMonth() {
    if (await onSaveMonth(month, closedDates, false)) {
      setSetupOpen(false);
      setClosedDates([]);
    }
  }

  async function saveDate() {
    if (await onSaveDate(editingDate, editingHours, false)) setEditingDate("");
  }

  function renderDay(dateKey: string) {
    const date = Number(dateKey.slice(-2));
    const exception = exceptionByDate.get(dateKey);
    const past = dateKey < today;
    const closed = setupOpen ? closedDates.includes(dateKey) : exception?.kind !== "CUSTOM";
    const label = past ? "Passado" : closed ? "Fechado" : "Vagas abertas";
    const count = exception?.kind === "CUSTOM" ? hoursForPeriods(exception.periods).length : 9;
    return (
      <motion.button
        key={dateKey}
        type="button"
        className={`availability-day${past ? " is-past" : closed ? " is-closed" : " is-open"}`}
        disabled={past || busy || selectedMonthIsPast}
        aria-label={`${date} de ${monthLabel(month)}, ${label}${!setupOpen && !closed ? `, ${count} horários` : ""}`}
        aria-pressed={!closed}
        onClick={() => setupOpen ? toggleDate(dateKey) : openDate(dateKey)}
        whileTap={!past && !busy ? { scale: 0.96 } : undefined}
      >
        <b>{date}</b>
        <span>{past ? "Passado" : setupOpen ? closed ? "Fechado" : "Aberto" : closed ? "Fechado" : `${count} horários`}</span>
      </motion.button>
    );
  }

  return (
    <>
      <section className="card availability-calendar-card">
        <div className="availability-calendar-nav">
          <Button variant="ghost" size="sm" disabled={previousMonthDisabled || busy} aria-label="Mês anterior" onClick={() => navigateMonth(-1)}>
            <IconChevronL width={18} height={18} />
          </Button>
          <h2>{monthLabel(month)}</h2>
          <Button variant="ghost" size="sm" disabled={busy} aria-label="Próximo mês" onClick={() => navigateMonth(1)}>
            <IconChevron width={18} height={18} />
          </Button>
        </div>

        {loading ? <div className="stack" aria-busy="true"><Skeleton h={280} r={14} /></div> : null}
        {!loading && !setupOpen && !configured && !hasConfiguredDates ? (
          <div className="availability-empty">
            <IconClock width={34} height={34} />
            <h3>Você ainda não abriu vagas para agendamento</h3>
            <p>Escolha um mês, marque os dias fechados e abra os horários das 08:00 às 16:00.</p>
            <Button variant="green" disabled={selectedMonthIsPast} onClick={() => setSetupOpen(true)}>
              <IconPlus width={18} height={18} /> Adicionar vagas
            </Button>
          </div>
        ) : null}
        {!loading && !setupOpen && configured ? (
          <p className="availability-calendar-hint">Selecione um dia para ajustar os horários disponíveis. Vagas abertas: 08:00–16:00.</p>
        ) : null}
        {!loading && !setupOpen && configured ? (
          <div className="availability-legend"><span><i className="is-open" /> Vagas abertas</span><span><i className="is-closed" /> Fechado</span></div>
        ) : null}
        {!loading && !setupOpen && hasConfiguredDates && !configured ? (
          <div className="availability-empty">
            <IconClock width={30} height={30} />
            <h3>Nenhuma vaga aberta neste mês</h3>
            <p>Abra as vagas deste mês para que os clientes possam escolher um horário.</p>
            <Button variant="green" disabled={selectedMonthIsPast} onClick={() => setSetupOpen(true)}>
              <IconPlus width={18} height={18} /> Adicionar vagas neste mês
            </Button>
          </div>
        ) : null}
        {!loading && (setupOpen || configured) ? (
          <>
            {setupOpen ? (
              <div className="availability-setup-note">
                <b>Horários padrão: 08:00 às 16:00</b>
                <span>Todos os dias futuros deste mês serão abertos. Clique nos dias em que não haverá atendimento.</span>
              </div>
            ) : null}
            <div className="availability-weekdays" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="availability-days">{days.map((date, index) => date ? renderDay(date) : <div key={`empty-${index}`} className="availability-day is-empty" aria-hidden="true" />)}</div>
            {setupOpen ? (
              <div className="availability-calendar-actions">
                <Button variant="ghost" disabled={busy} onClick={() => { setSetupOpen(false); setClosedDates([]); }}>Cancelar</Button>
                <Button variant="green" loading={busy} onClick={() => void saveMonth()}>Abrir vagas do mês</Button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <Modal
        open={Boolean(editingDate)}
        onClose={() => setEditingDate("")}
        title={`Horários de ${editingDate ? new Date(`${editingDate}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", dateStyle: "long" }) : ""}`}
        footer={<><Button variant="ghost" disabled={busy} onClick={() => setEditingDate("")}>Cancelar</Button><Button variant="green" loading={busy} onClick={() => void saveDate()}>Salvar horários</Button></>}
      >
        <p className="availability-calendar-hint">Desmarque os horários em que não haverá atendimento. A partir das 08:00, cada horário ocupa uma hora.</p>
        <div className="availability-hour-grid">
          {HOURS.map((hour) => {
            const available = editingHours.includes(hour);
            return (
              <button
                type="button"
                key={hour}
                className={`availability-hour${available ? " is-open" : ""}`}
                aria-pressed={available}
                disabled={busy}
                onClick={() => setEditingHours((current) => available ? current.filter((value) => value !== hour) : [...current, hour].sort((a, b) => a - b))}
              >
                <b>{String(hour).padStart(2, "0")}:00</b><span>{available ? "Disponível" : "Fechado"}</span>
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditingHours(HOURS)}>Restaurar 08:00–16:00</Button>
        {selectedException?.reason ? <p className="muted" style={{ marginTop: 12 }}>{selectedException.reason}</p> : null}
      </Modal>
    </>
  );
}
