"use client";
import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AsYouType, getCountryCallingCode, parsePhoneNumberFromString, validatePhoneNumberLength, type CountryCode } from "libphonenumber-js";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import Tooltip from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { IconCheck, IconChevron, IconChevronL, IconGoogle, IconInfo } from "@/components/ui/Icons";
import { americanPhoneCountries, phoneCountries } from "@/lib/phoneCountries";
import { keyLabel, todayKey } from "@/lib/format";
import { monthDates, monthLabel, shiftMonth } from "@/lib/calendar";

const empty = { date: "", hour: -1, name: "", country: "BR" as CountryCode, phone: "", address: "", description: "", website: "" };
type Form = typeof empty;
type Errors = Partial<Record<"name" | "phone" | "address" | "description", string>>;
const STEPS = ["Data e hora", "Seus dados", "Revisão"];
const DRAFT = "oc_draft";
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function phoneDigitsForCountry(value: string, country: CountryCode) {
  let digits = value.replace(/\D/g, "").slice(0, 15);
  while (digits && validatePhoneNumberLength(digits, country) === "TOO_LONG") {
    digits = digits.slice(0, -1);
  }
  return digits;
}

function validate(f: Form): Errors {
  const e: Errors = {};
  const name = f.name.trim();
  if (name.length < 3 || !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) e.name = "Use pelo menos 3 letras, sem acentos ou números.";
  if (!parsePhoneNumberFromString(f.phone, f.country)?.isValid()) e.phone = "Confira o país e informe um número válido com DDD.";
  if (f.address.trim().length < 8) e.address = "Informe rua, número e bairro (mín. 8 caracteres).";
  if (f.description.trim().length < 10) e.description = "Descreva o serviço (mín. 10 caracteres).";
  return e;
}

export default function Wizard({ onCreated }: { onCreated: () => void }) {
  const { data: session, status } = useSession();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [f, setF] = useState<Form>(empty);
  const [touched, setTouched] = useState(false);
  const [profileNameLocked, setProfileNameLocked] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [calendarSlots, setCalendarSlots] = useState<Record<string, number[]>>({});
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState("");
  const [hours, setHours] = useState<number[] | null>(null);
  const [availErr, setAvailErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [slotsKey, setSlotsKey] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const errors = validate(f);
  const shown: Errors = touched ? errors : {};
  const calendarDays = monthDates(month);
  const currentMonth = todayKey().slice(0, 7);
  const availableDateCount = Object.values(calendarSlots).filter((dayHours) => dayHours.length > 0).length;

  // restaura rascunho após voltar do login do Google
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT);
      if (!saved) return;
      const d = JSON.parse(saved) as Partial<Form> & { step?: number };
      setF({
        ...empty, ...d,
        hour: typeof d.hour === "number" && d.hour >= 0 ? d.hour : -1,
        name: typeof d.name === "string" ? d.name.replace(/[^A-Za-z ]/g, "") : "",
        country: phoneCountries.find(({ code }) => code === d.country)?.code ?? "BR",
        phone: typeof d.phone === "string" ? d.phone.replace(/\D/g, "").slice(0, 15) : "",
        website: "",
      });
      setStep(Math.min(Math.max(Number(d.step) || 0, 0), 2));
      sessionStorage.removeItem(DRAFT);
    } catch {}
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      setProfileLoading(false);
      if (status === "unauthenticated") {
        setProfileNameLocked(false);
        setProfileError("");
      }
      return;
    }

    const controller = new AbortController();
    setProfileLoading(true);
    setProfileNameLocked(false);
    setProfileError("");
    fetch("/api/bookings", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const data = await r.json() as { profile?: { name: string | null; phone: string | null }; error?: string };
        if (!r.ok) throw new Error(data.error ?? "Não foi possível carregar seu cadastro.");
        return data.profile;
      })
      .then((profile) => {
        if (controller.signal.aborted) return;
        if (!profile) return;
        const savedName = profile.name?.trim() ?? "";
        const savedPhone = profile.phone ? parsePhoneNumberFromString(profile.phone) : undefined;
        const savedCountry = phoneCountries.find(({ code }) => code === savedPhone?.country)?.code;
        if (profile.phone && !savedPhone?.isValid()) {
          setProfileError("Não foi possível ler o telefone salvo. Confira o número antes de continuar.");
        }
        setProfileNameLocked(Boolean(savedName));
        setF((current) => ({
          ...current,
          name: savedName || current.name,
          ...(savedPhone?.isValid() ? {
            country: savedCountry ?? current.country,
            phone: savedPhone.nationalNumber,
          } : {}),
        }));
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setProfileError(cause instanceof Error ? cause.message : "Não foi possível carregar seu cadastro.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setProfileLoading(false);
      });
    return () => controller.abort();
  }, [status, session?.user?.email]);

  useEffect(() => {
    const controller = new AbortController();
    setCalendarLoading(true);
    setCalendarError("");
    setCalendarSlots({});
    fetch(`/api/slots?${new URLSearchParams({ month })}`, { signal: controller.signal })
      .then(async (r) => {
        const data = await r.json() as { days?: Record<string, number[]>; error?: string };
        if (!r.ok) throw new Error(data.error ?? "Não foi possível carregar as datas disponíveis.");
        if (!data.days) throw new Error("A resposta de disponibilidade está inválida.");
        setCalendarSlots(data.days);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setCalendarError(e instanceof Error ? e.message : "Não foi possível carregar as datas disponíveis.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCalendarLoading(false);
      });
    return () => controller.abort();
  }, [month, slotsKey]);

  useEffect(() => {
    setHours(null); setAvailErr("");
    if (!f.date) return;
    let alive = true;
    fetch(`/api/slots?${new URLSearchParams({ date: f.date })}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Não foi possível carregar os horários."); return d as { hours: number[] }; })
      .then((d) => alive && setHours(d.hours))
      .catch((e: unknown) => { if (!alive) return; setHours([]); setAvailErr(e instanceof Error ? e.message : "Não foi possível carregar os horários."); });
    return () => { alive = false; };
  }, [f.date, slotsKey]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    card.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [step, reduce]);

  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n); };
  function navigateMonth(direction: -1 | 1) {
    if (direction === -1 && month <= currentMonth) return;
    setMonth(shiftMonth(month, direction));
    set("date", "");
    set("hour", -1);
    setHours(null);
  }
  const login = () => {
    try { sessionStorage.setItem(DRAFT, JSON.stringify({ ...f, website: "", step })); } catch {}
    signIn("google");
  };

  function next() {
    if (step === 0) {
      if (!f.date || f.hour < 0) return toast.error("Escolha o dia e o horário", "Toque em um dia e depois em um horário livre.");
      return go(1);
    }
    setTouched(true);
    if (Object.keys(errors).length) return toast.error("Confira os campos destacados");
    go(2);
  }

  async function submit() {
    setBusy(true);
    const r = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const d = await r?.json().catch(() => ({})) as { error?: string; profile?: { name: string | null; phone: string | null } } | undefined;
    setBusy(false);
    if (r?.ok) {
      const savedName = d?.profile?.name ?? f.name;
      const savedPhone = d?.profile?.phone ? parsePhoneNumberFromString(d.profile.phone) : undefined;
      const savedCountry = phoneCountries.find(({ code }) => code === savedPhone?.country)?.code;
      setProfileNameLocked(Boolean(savedName));
      setProfileError("");
      setDone(true);
      setF({
        ...empty,
        name: savedName,
        country: savedCountry ?? f.country,
        phone: savedPhone?.nationalNumber ?? f.phone,
      });
      setTouched(false);
      setStep(0);
      setDir(-1);
      onCreated();
      return;
    }
    toast.error("Não foi possível agendar", d?.error ?? "Verifique sua conexão e tente de novo.");
    if (r?.status === 409) { go(0); set("hour", -1); setSlotsKey((k) => k + 1); }
  }

  const slide = { enter: (d: number) => ({ opacity: 0, x: d * 28 }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: d * -28 }) };
  const parsed = parsePhoneNumberFromString(f.phone, f.country);
  const authed = status === "authenticated";
  const formattedPhone = f.phone ? new AsYouType(f.country).input(f.phone) : "";
  const selectedCountry = phoneCountries.find(({ code }) => code === f.country);
  const selectedCountryIsAmerican = americanPhoneCountries.some(({ code }) => code === f.country);

  return (
    <>
      <div className="card wiz" ref={card}>
        <ol className="steps" aria-label="Etapas do agendamento">
          <motion.i className="steps-fill" initial={false} animate={{ scaleX: step / 2 }} transition={{ type: "spring", damping: 26, stiffness: 220 }} />
          {STEPS.map((s, i) => (
            <li key={s} className={`step${i === step ? " on" : ""}${i < step ? " done" : ""}`} aria-current={i === step ? "step" : undefined}>
              <i>{i < step ? <IconCheck width={16} height={16} /> : i + 1}</i>{s}
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            {step === 0 && (
              <>
                <h2>Quando podemos ir?</h2>
                <p className="sub">Escolha o dia e depois um horário livre.</p>
                <div className="availability-calendar-card booking-calendar">
                  <div className="availability-calendar-nav">
                    <Button variant="ghost" size="sm" disabled={month <= currentMonth || calendarLoading} aria-label="Mês anterior" onClick={() => navigateMonth(-1)}>
                      <IconChevronL width={18} height={18} />
                    </Button>
                    <h3>{monthLabel(month)}</h3>
                    <Button variant="ghost" size="sm" disabled={calendarLoading} aria-label="Próximo mês" onClick={() => navigateMonth(1)}>
                      <IconChevron width={18} height={18} />
                    </Button>
                  </div>
                  <p className="availability-calendar-hint">Só aparecem os dias que têm horários livres. Escolha um para ver os horários.</p>
                  {calendarError && <p className="booking-calendar-error" role="alert">{calendarError} <button type="button" className="link-btn" onClick={() => setSlotsKey((key) => key + 1)}>Tentar novamente</button></p>}
                  {!calendarLoading && !calendarError && availableDateCount === 0 && <p className="booking-calendar-empty-month">Nenhuma data disponível neste mês. Consulte outro mês.</p>}
                  <div className="availability-weekdays" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
                  <div className="availability-days" aria-label={`Calendário de ${monthLabel(month)}`}>
                    {calendarDays.map((date, index) => {
                      if (!date) return <div key={`empty-${index}`} className="availability-day is-empty" aria-hidden="true" />;
                      const availableHours = calendarSlots[date] ?? [];
                      const available = availableHours.length > 0;
                      if (!calendarLoading && (!available || calendarError)) return <div key={date} className="availability-day is-empty" aria-hidden="true" />;
                      const past = date < todayKey();
                      return (
                        <motion.button
                          key={date}
                          type="button"
                          className={`availability-day${available ? " is-open" : " is-closed"}${past ? " is-past" : ""}${f.date === date ? " is-selected" : ""}`}
                          disabled={calendarLoading || Boolean(calendarError) || !available || past}
                          aria-label={calendarLoading ? `${keyLabel(date, { weekday: "long", day: "numeric", month: "long" })}, carregando disponibilidade` : `${keyLabel(date, { weekday: "long", day: "numeric", month: "long" })}, ${availableHours.length} horários disponíveis`}
                          aria-pressed={f.date === date}
                          whileTap={available && !past ? { scale: 0.96 } : undefined}
                          onClick={() => { set("date", date); set("hour", -1); }}
                        >
                          <b>{Number(date.slice(-2))}</b>
                          <span>{calendarLoading ? "…" : available ? `${availableHours.length} vagas` : "Sem vagas"}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
                {f.date && (
                  <div aria-live="polite">
                    <p className="hint" style={{ marginBottom: 6 }}>{availErr || (hours === null ? "Buscando horários…" : hours.length ? `Horários livres em ${keyLabel(f.date, { day: "numeric", month: "long" })}:` : "Sem horários livres nesse dia. Tente outra data.")}</p>
                    <div className="hours" role="radiogroup" aria-label="Horários livres">
                      {hours === null ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={46} r={12} />) : hours.map((h, i) => (
                        <motion.button key={h} type="button" role="radio" aria-checked={f.hour === h} className="hour" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.025 }} whileTap={{ scale: 0.95 }} onClick={() => set("hour", h)}>
                          {String(h).padStart(2, "0")}:00
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 1 && (
              <>
                <h2>Onde e o que precisa?</h2>
                <p className="sub">Com esses dados a equipe confirma o serviço com você.</p>
                <Field label="Nome" hint={profileLoading ? "Carregando seu cadastro…" : profileNameLocked ? "Nome definido no primeiro agendamento. Para alterar, solicite à equipe." : undefined} error={shown.name}>
                  <input value={f.name} maxLength={80} autoComplete="name" placeholder="Seu nome" disabled={profileNameLocked || profileLoading} onChange={(e) => set("name", e.target.value.replace(/[^A-Za-z ]/g, ""))} />
                </Field>
                <div className={`field${shown.phone ? " invalid" : ""}`} role="group" aria-label="Telefone">
                  <span className="field-l">Telefone <Tooltip content="Escolha o país e informe DDD e número. A formatação e a validade são verificadas automaticamente."><span className="muted" tabIndex={0} aria-label="Ajuda sobre o telefone"><IconInfo width={16} height={16} /></span></Tooltip></span>
                  <div className="phone-row">
                    <select aria-label="País e DDI do telefone" value={f.country} disabled={profileLoading} onChange={(e) => {
                      const country = e.target.value as CountryCode;
                      set("country", country);
                      set("phone", phoneDigitsForCountry(f.phone, country));
                    }}>
                      {!selectedCountryIsAmerican && selectedCountry && <option value={selectedCountry.code}>{selectedCountry.name} (+{getCountryCallingCode(selectedCountry.code)})</option>}
                      {americanPhoneCountries.map(({ code, name }) => <option key={code} value={code}>{name} (+{getCountryCallingCode(code)})</option>)}
                    </select>
                    <input aria-label="Número de telefone com DDD" type="tel" inputMode="numeric" maxLength={25} autoComplete="tel-national" placeholder="DDD e número" value={formattedPhone} disabled={profileLoading} onChange={(e) => set("phone", phoneDigitsForCountry(e.target.value, f.country))} />
                  </div>
                  {shown.phone && <span role="alert" className="f-err">{shown.phone}</span>}
                  {profileError && <span role="alert" className="f-err">{profileError}</span>}
                </div>
                <Field label="Endereço do serviço" error={shown.address}>
                  <input value={f.address} maxLength={200} autoComplete="street-address" placeholder="Rua, número, bairro, cidade" onChange={(e) => set("address", e.target.value)} />
                </Field>
                <Field label="Descrição do serviço" hint={`${f.description.length}/600`} error={shown.description}>
                  <textarea value={f.description} maxLength={600} placeholder="Ex.: trocar 12 metros de calha na lateral da casa" onChange={(e) => set("description", e.target.value)} />
                </Field>
                <div className="hp" aria-hidden="true"><label>Site<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} /></label></div>
              </>
            )}

            {step === 2 && (
              <>
                <h2>Confira e envie</h2>
                <p className="sub">Se algo estiver errado, toque em “Editar”.</p>
                <dl className="summary">
                  <div><dt>Quando</dt><dd>{keyLabel(f.date, { weekday: "long", day: "numeric", month: "long" })}, às {String(f.hour).padStart(2, "0")}:00</dd><button type="button" className="link-btn" onClick={() => go(0)}>Editar</button></div>
                  <div><dt>Nome</dt><dd>{f.name}</dd><button type="button" className="link-btn" onClick={() => go(1)}>Editar</button></div>
                  <div><dt>Telefone</dt><dd>{parsed?.formatInternational() ?? f.phone}</dd><span /></div>
                  <div><dt>Endereço</dt><dd>{f.address}</dd><span /></div>
                  <div><dt>Serviço</dt><dd>{f.description}</dd><span /></div>
                </dl>
                {!authed && <div className="note" style={{ marginBottom: 6 }}><IconInfo width={20} height={20} /><span>Para enviar, entre com sua conta Google. Seus dados ficam salvos enquanto você entra.</span></div>}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="wiz-actions">
          {step > 0 && <Button variant="ghost" onClick={() => go(step - 1)} disabled={busy}>Voltar</Button>}
          {step < 2 ? <Button onClick={next} full={step === 0}>Continuar</Button>
            : authed ? <Button onClick={submit} loading={busy}>Solicitar agendamento</Button>
            : <Button variant="google" onClick={login} disabled={status === "loading"}><IconGoogle /> Entrar com Google</Button>}
        </div>
        {authed && step === 2 && <p className="hint" style={{ marginTop: 10, textAlign: "center" }}>Conectado como {session?.user?.email}</p>}
      </div>

      <Modal open={done} onClose={() => setDone(false)} size="sm" title="Solicitação enviada!"
        footer={<><Button variant="ghost" onClick={() => { setDone(false); setTimeout(() => document.getElementById("meus")?.scrollIntoView({ behavior: "smooth" }), 150); }}>Ver meus agendamentos</Button><Button variant="green" onClick={() => setDone(false)}>Entendi</Button></>}>
        <motion.div className="success-mark" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 12 }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <motion.path d="M20 6L9 17l-5-5" pathLength={1} strokeDasharray={1} initial={{ strokeDashoffset: 1 }} animate={{ strokeDashoffset: 0 }} transition={{ delay: 0.25, duration: 0.45 }} />
          </svg>
        </motion.div>
        <p style={{ textAlign: "center", marginBottom: 14 }}>Entraremos em contato para confirmar o horário.</p>
        <div className="note"><IconInfo width={20} height={20} /><span>No caso de cancelamento com menos de 24h para a realização do serviço é cobrado uma taxa de R$50.00</span></div>
      </Modal>
    </>
  );
}
