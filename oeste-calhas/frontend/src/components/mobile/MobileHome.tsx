"use client";
import { useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import Header from "@/components/Header";
import Wizard from "@/components/booking/Wizard";
import MyBookings from "@/components/booking/MyBookings";
import GutterArt from "@/components/booking/GutterArt";
import HeroTitle from "@/components/booking/HeroTitle";
import Button from "@/components/ui/Button";
import Tooltip from "@/components/ui/Tooltip";
import Skeleton from "@/components/ui/Skeleton";
import { IconCalendar, IconChat, IconChevron, IconClock, IconGoogle, IconLock, IconLogout } from "@/components/ui/Icons";

const WHATS = (process.env.NEXT_PUBLIC_WHATSAPP ?? "").replace(/\D/g, "");

const PERKS = [
  { icon: IconCalendar, title: "Horários da equipe", text: "Você só vê o que está livre." },
  { icon: IconClock, title: "Até 3 em aberto", text: "Por conta, para todos terem vez." },
  { icon: IconLock, title: "Login com Google", text: "Só você vê seus agendamentos." },
];

/** Versão exclusiva para celular. Mesma identidade visual, composição vertical e animações ligadas à rolagem. */
export default function MobileHome() {
  const { data: session, status } = useSession();
  const reduce = useReducedMotion();
  const [version, setVersion] = useState(0);
  const first = session?.user?.name?.split(" ")[0] ?? "";

  const heroRef = useRef<HTMLElement>(null);
  const wizRef = useRef<HTMLDivElement>(null);
  const wizVisible = useInView(wizRef, { amount: 0.25 });

  // parallax da hero: a calha desce mais devagar e some, o texto sobe de leve
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const artY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 70]);
  const artOpacity = useTransform(scrollYProgress, [0, 0.9], [1, reduce ? 1 : 0.15]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -24]);

  const rise = (delay = 0) => reduce ? {} : ({ initial: { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "0px 0px -10% 0px" }, transition: { duration: 0.55, delay, ease: "easeOut" } } as const);
  const goWizard = () => wizRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });

  return (
    <div className="m">
      <Header scrollFx>
        {status === "loading" ? <Skeleton w={44} h={38} r={10} /> : status === "authenticated" ? (
          <div className="who">
            <span className="avatar" aria-hidden="true">{first.charAt(0).toUpperCase() || "?"}</span>
            <Tooltip content="Sair da conta" side="bottom"><Button variant="ghost" size="icon" aria-label="Sair da conta" onClick={() => signOut()}><IconLogout /></Button></Tooltip>
          </div>
        ) : <Button variant="ghost" size="sm" onClick={() => signIn("google")}><IconGoogle width={18} height={18} /> Entrar</Button>}
      </Header>

      <main>
        <section className="m-hero" ref={heroRef}>
          <motion.div style={{ y: textY }}>
            <motion.p className="m-eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>Instalação · Reparo · Limpeza</motion.p>
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}><HeroTitle /></motion.div>
            <motion.p className="m-lead" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
              Escolha a data e o horário, diga onde e o que precisa. A equipe da Oeste Calhas confirma com você.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }}>
              <Button full onClick={goWizard}>Agendar agora <IconChevron width={18} height={18} style={{ rotate: "90deg" }} /></Button>
            </motion.div>
          </motion.div>
          <motion.div style={{ y: artY, opacity: artOpacity }}><GutterArt /></motion.div>
        </section>

        <ul className="m-perks" aria-label="Como funciona">
          {PERKS.map((p, i) => (
            <motion.li key={p.title} {...rise(i * 0.08)}>
              <span className="perk-ic"><p.icon /></span>
              <strong>{p.title}</strong>
              <span>{p.text}</span>
            </motion.li>
          ))}
        </ul>

        <motion.div className="m-wiz" id="agendar" ref={wizRef} {...rise()}>
          <Wizard onCreated={() => setVersion((v) => v + 1)} />
        </motion.div>

        <MyBookings version={version} scrollReveal />

        {/* Sticky: acompanha a tela por todo o conteúdo, e pousa aqui no fim; ao subir, volta a seguir. */}
        <motion.div className="m-dock" initial={false} animate={{ opacity: wizVisible ? 0 : 1, y: wizVisible ? 24 : 0 }} transition={{ type: "spring", damping: 26, stiffness: 260 }} style={{ pointerEvents: wizVisible ? "none" : "auto" }} aria-hidden={wizVisible}>
          <div className="m-dock-in">
            <span className="m-dock-ic"><IconCalendar width={20} height={20} /></span>
            <span className="m-dock-tx"><b>Novo agendamento</b><small>Leva menos de 1 minuto</small></span>
            <Button size="sm" onClick={goWizard} tabIndex={wizVisible ? -1 : 0}>Agendar</Button>
          </div>
        </motion.div>
      </main>

      {WHATS && <Tooltip content="Falar no WhatsApp" side="top"><a className="fab" href={`https://wa.me/${WHATS}`} target="_blank" rel="noopener noreferrer" aria-label="Falar com a equipe no WhatsApp"><IconChat width={26} height={26} /></a></Tooltip>}
      <footer className="site-foot">© {new Date().getFullYear()} Oeste Calhas · <a href="/termos">Termos e serviços</a> · <a href="/?view=desktop">Versão para computador</a></footer>
    </div>
  );
}
