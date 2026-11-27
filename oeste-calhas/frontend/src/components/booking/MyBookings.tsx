"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import Tooltip from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { IconCalendar, IconChat, IconChevron, IconPin } from "@/components/ui/Icons";
import { STATUS_HELP, fmtDateLong, fmtTime, parts } from "@/lib/format";

type Mine = { id: string; startsAt: string; status: string; address: string; description: string };
const WHATS = (process.env.NEXT_PUBLIC_WHATSAPP ?? "").replace(/\D/g, "");

export default function MyBookings({ version, scrollReveal = false }: { version: number; scrollReveal?: boolean }) {
  const { status } = useSession();
  const toast = useToast();
  const [list, setList] = useState<Mine[] | null>(null);
  const [sel, setSel] = useState<Mine | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/bookings", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setList((await r.json()).bookings); else { setList([]); toast.error("Não foi possível carregar seus agendamentos"); }
  }, [toast]);
  useEffect(() => { if (status === "authenticated") void load(); }, [status, load, version]);
  if (status !== "authenticated") return null;

  const wa = (b: Mine) => `https://wa.me/${WHATS}?text=${encodeURIComponent(`Olá! Preciso falar sobre meu agendamento de ${fmtDateLong(b.startsAt)} às ${fmtTime(b.startsAt)}.`)}`;

  return (
    <section className="mine-wrap" id="meus" aria-labelledby="meus-t">
      <div className="spread"><h2 id="meus-t" style={{ fontSize: "1.7rem" }}>Meus agendamentos</h2>
        <Tooltip content="Para alterar ou cancelar, fale com a equipe."><span className="hint" tabIndex={0}>Quer alterar algo?</span></Tooltip></div>
      <div className="mine-grid">
        {list === null ? Array.from({ length: 3 }, (_, i) => <div key={i} className="bk" aria-hidden="true"><Skeleton h={62} r={14} /><div style={{ display: "grid", gap: 8 }}><Skeleton h={16} w="70%" /><Skeleton h={12} /></div><Skeleton h={24} w={90} r={99} /></div>)
          : list.length === 0 ? (
            <div className="empty card" style={{ gridColumn: "1 / -1" }}><IconCalendar width={36} height={36} /><h3>Você ainda não tem agendamentos</h3><p>Escolha um dia e horário no formulário acima.</p></div>
          ) : list.map((b, i) => (
            <motion.button key={b.id} className="bk" {...(scrollReveal ? { initial: { opacity: 0, y: 32, scale: 0.97 }, whileInView: { opacity: 1, y: 0, scale: 1 }, viewport: { once: true, margin: "0px 0px -12% 0px" }, transition: { type: "spring", damping: 24, stiffness: 180 } } : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: Math.min(i, 6) * 0.05 } })} onClick={() => setSel(b)} aria-label={`Ver detalhes do agendamento de ${fmtDateLong(b.startsAt)}`}>
              <span className="bk-date"><b>{parts(b.startsAt).day}</b><small>{parts(b.startsAt).mon}</small></span>
              <span><strong>{fmtTime(b.startsAt)}</strong><span className="clamp">{b.description}</span></span>
              <Tooltip content={STATUS_HELP[b.status] ?? ""}><StatusBadge status={b.status} /></Tooltip>
            </motion.button>
          ))}
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} title="Seu agendamento"
        footer={sel && WHATS ? <a className="btn v-green" href={wa(sel)} target="_blank" rel="noopener noreferrer"><IconChat width={18} height={18} /> Falar com a equipe</a> : <Button variant="green" onClick={() => setSel(null)}>Fechar</Button>}>
        <AnimatePresence mode="wait">{sel && (
          <motion.div key={sel.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p style={{ marginBottom: 14 }}><StatusBadge status={sel.status} /> <span className="hint"> {STATUS_HELP[sel.status]}</span></p>
            <dl className="dl">
              <dt>Quando</dt><dd style={{ textTransform: "capitalize" }}>{fmtDateLong(sel.startsAt)}, às {fmtTime(sel.startsAt)}</dd>
              <dt>Endereço</dt><dd><IconPin width={14} height={14} style={{ verticalAlign: "-2px" }} /> {sel.address}</dd>
              <dt>Serviço</dt><dd>{sel.description}</dd>
            </dl>
            <p className="hint">Para alterar ou cancelar, fale com a equipe <IconChevron width={12} height={12} style={{ verticalAlign: "-1px" }} /> o horário é liberado após o cancelamento ser processado.</p>
          </motion.div>
        )}</AnimatePresence>
      </Modal>
    </section>
  );
}
